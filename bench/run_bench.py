"""Run the GET benchmark matrix across JDKs and write results to out/bench.jsonl.

Works on Windows, macOS and Linux. Needs Python 3.9+ and the JDK homes you want to compare.

  python bench/run_bench.py --jdk 21=C:\\path\\to\\jdk-21 --jdk 25=C:\\path\\to\\jdk-25 --jdk 27=C:\\path\\to\\jdk-27

Options: --latency MS (default 20), --runs R (default 3), --sizes 200,1000, --quick (sizes 100, runs 1).
The echo server runs in its own JVM on the newest JDK given, so it never competes for the client JVM's carriers.
"""
import argparse, json, os, pathlib, shutil, subprocess, socket

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
EXE = ".exe" if os.name == "nt" else ""

# Methods that block one thread per call for the whole run are only measured at the smallest size:
# at 1000 tasks they take minutes and the answer is already known (about n x 2 x latency).
SLOW_AT_SCALE = {"loop"}
CORE_METHODS = ["loop", "cf-async", "cf-pool", "cf-common", "vt", "vt-vtclient", "vt-sync"]
SCOPED_METHODS = ["sts", "vt-scoped"]


def tool(home, name):
    return str(pathlib.Path(home) / "bin" / (name + EXE))


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def compile_all(jdks, build):
    if build.exists():
        shutil.rmtree(build)
    oldest = min(jdks)
    core = build / "core"
    core.mkdir(parents=True)
    subprocess.run([tool(jdks[oldest], "javac"), "--release", str(oldest), "-d", str(core),
                    str(HERE / "GetBench.java"), str(HERE / "EchoServer.java")], check=True)
    scoped = {}
    for v, home in jdks.items():
        if v < 25:
            continue                       # ScopedValue is final from 25; StructuredTaskScope's API differs on 21
        d = build / f"scoped{v}"
        d.mkdir()
        subprocess.run([tool(home, "javac"), "--release", str(v), "--enable-preview", "-d", str(d),
                        str(HERE / "GetBenchScoped.java")], check=True, stderr=subprocess.DEVNULL)
        scoped[v] = d
    return core, scoped


def java(home, cp, args, preview=False, timeout=900):
    env = dict(os.environ)
    env.pop("JAVA_TOOL_OPTIONS", None)     # keep the JVM's startup banner out of the JSON
    cmd = [tool(home, "java"), "-cp", str(cp)] + (["--enable-preview"] if preview else []) + args
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return {"error": f"timed out after {timeout}s"}
    lines = [l for l in out.stdout.splitlines() if l.startswith("{")]
    if out.returncode != 0 or not lines:
        # A failed run is a result too (e.g. the common pool refusing more compensation threads).
        err = [l.strip() for l in out.stderr.splitlines() if "Exception" in l or "Error" in l]
        return {"error": (err[-1] if err else f"exit {out.returncode}")[:300]}
    return json.loads(lines[-1])


def record(results, jdk, method, n, mode, r, latency):
    if "error" in r:
        r.update({"jdk": jdk, "method": method, "n": n, "calls": 2 * n, "mode": mode, "medianMs": None,
                  "forwarded": 0, "peakPlatformThreads": None})
    r["latencyMs"] = latency
    results.append(r)
    if "error" in r:
        print(f"JDK {jdk} {method:11} n={n:5} {mode:11} FAILED: {r['error']}", flush=True)
    else:
        print(f"JDK {jdk} {method:11} n={n:5} {mode:11} median {r['medianMs']:6} ms  forwarded {r['forwarded']}/{r['calls']}"
              f"  peak platform threads {r['peakPlatformThreads']}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jdk", action="append", required=True, help="VERSION=JDK_HOME, repeatable")
    ap.add_argument("--latency", type=int, default=20)
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--sizes", default="200,1000")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "out" / "bench.jsonl"))
    a = ap.parse_args()
    jdks = {int(k): v for k, v in (j.split("=", 1) for j in a.jdk)}
    sizes = [100] if a.quick else [int(s) for s in a.sizes.split(",")]
    runs = 1 if a.quick else a.runs
    core, scoped = compile_all(jdks, ROOT / "bench" / "build")

    port = free_port()
    server = subprocess.Popen([tool(jdks[max(jdks)], "java"), "-cp", str(core), "EchoServer", str(port), str(a.latency)],
                              stdout=subprocess.PIPE, text=True)
    server.stdout.readline()
    results = []
    try:
        for v, home in sorted(jdks.items()):
            for n in sizes:
                for m in CORE_METHODS:
                    if m in SLOW_AT_SCALE and n != min(sizes):
                        continue
                    r = java(home, core, ["GetBench", str(port), m, str(n), "explicit", str(runs)])
                    record(results, v, m, n, "explicit", r, a.latency)
                if v in scoped:
                    for m in SCOPED_METHODS:
                        r = java(home, scoped[v], ["GetBenchScoped", str(port), m, str(n), str(runs)], preview=True)
                        record(results, v, m, n, "scoped", r, a.latency)
            # context-propagation check: the naive ThreadLocal pattern, small n, one run
            for m in CORE_METHODS:
                r = java(home, core, ["GetBench", str(port), m, "50", "threadlocal", "1"])
                record(results, v, m, 50, "threadlocal", r, a.latency)
    finally:
        server.terminate()
    pathlib.Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    with open(a.out, "w") as f:
        for r in results:
            f.write(json.dumps(r) + "\n")
    print(f"wrote {len(results)} results to {a.out}")


if __name__ == "__main__":
    main()

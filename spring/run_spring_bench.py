"""Spring fan-out benchmark: RestTemplate vs RestClient, platform-pool vs virtual-thread executor beans,
header forwarding checked on every call. Writes JSON lines to ../out/spring-bench.jsonl (or --out).

  python spring/run_spring_bench.py \
     --config "Java 17 + Boot 3.5=<jdk17 home>=spring/dist/fanout-boot3.jar" \
     --config "Java 25 + Boot 3.5=<jdk25 home>=spring/dist/fanout-boot3.jar" \
     --config "Java 25 + Boot 4.1=<jdk25 home>=spring/dist/fanout-boot4.jar"

Build the jars first:  cd spring && mvn -Pboot3 clean package && copy target/fanout-boot3.jar dist/  (same for boot4)
Needs Python 3.9+. The downstream echo server (bench/EchoServer.java) runs on the newest JDK given.
"""
import argparse, json, os, pathlib, socket, subprocess, time, urllib.request, statistics

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
EXE = ".exe" if os.name == "nt" else ""
INBOUND = {"X-Request-Id": "req-7f3a", "X-Tenant-Id": "acme", "Authorization": "Bearer tok-55a54008",
           "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"}

MAIN = ["rt-loop", "rt-boot8", "rt-pool", "rt-vt", "rc-pool", "rc-vt", "rc-vt-limit", "rc-vt-explicit"]
CONTEXT = ["rt-pool-nodec", "rc-vt-nodec"]
FACTORIES = ["hc5-default", "simple", "jdk", "hc5-tuned"]


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def env():
    e = dict(os.environ)
    e.pop("JAVA_TOOL_OPTIONS", None)
    return e


def wait_http(url, timeout=90):
    end = time.time() + timeout
    while time.time() < end:
        try:
            urllib.request.urlopen(url, timeout=2)
            return
        except urllib.error.HTTPError:
            return                                   # app is up (400 for missing params is fine)
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"{url} did not come up")


def call(port, scenario, n, factory="hc5-tuned"):
    url = f"http://127.0.0.1:{port}/fanout?scenario={scenario}&n={n}&factory={factory}"
    req = urllib.request.Request(url, headers=INBOUND)
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())


def measure(port, scenario, n, runs, factory="hc5-tuned"):
    call(port, scenario, min(n, 50), factory)        # warm-up
    results = [call(port, scenario, n, factory) for _ in range(runs)]
    errs = [r for r in results if "error" in r]
    if errs:
        r = errs[0]
        r["medianMs"] = None
        return r
    r = dict(results[-1])
    r["runsMs"] = [x["ms"] for x in results]
    r["medianMs"] = int(statistics.median(r["runsMs"]))
    r["forwarded"] = min(x["forwarded"] for x in results)
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", action="append", required=True, help="LABEL=JDK_HOME=JAR")
    ap.add_argument("--latency", type=int, default=20)
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--sizes", default="200,1000")
    ap.add_argument("--machine", default="container")
    ap.add_argument("--out", default=str(ROOT / "out" / "spring-bench.jsonl"))
    a = ap.parse_args()
    configs = [c.split("=", 2) for c in a.config]
    sizes = [int(s) for s in a.sizes.split(",")]

    newest = max(configs, key=lambda c: int(subprocess.run([str(pathlib.Path(c[1]) / "bin" / ("java" + EXE)), "-XshowSettings:properties", "-version"],
                                                             capture_output=True, text=True, env=env()).stderr.split("java.specification.version = ")[1].split()[0]))[1]
    build = HERE / "build"
    build.mkdir(exist_ok=True)
    subprocess.run([str(pathlib.Path(newest) / "bin" / ("javac" + EXE)), "-d", str(build), str(ROOT / "bench" / "EchoServer.java")], check=True, env=env())
    dport = free_port()
    # The JDK's built-in server closes idle keep-alive connections beyond 200 by default; the clients here pool
    # hundreds each, so raise its limits or HttpClient 5 will hit closed connections (NoHttpResponseException).
    echo = subprocess.Popen([str(pathlib.Path(newest) / "bin" / ("java" + EXE)), "-Dsun.net.httpserver.maxIdleConnections=20000",
                             "-Dsun.net.httpserver.idleInterval=600", "-cp", str(build), "EchoServer", str(dport), str(a.latency)],
                            stdout=subprocess.PIPE, text=True, env=env())
    echo.stdout.readline()
    results = []

    def record(label, r, kind):
        r.update({"config": label, "kind": kind, "machine": a.machine, "latencyMs": a.latency})
        results.append(r)
        tag = f"FAILED {r['error']}" if "error" in r else f"median {r['medianMs']:6} ms  forwarded {r['forwarded']}/{r['calls']}"
        print(f"{label:20} {kind:8} {r['scenario']:15} {r.get('factory',''):11} n={r['n']:5} {tag}", flush=True)

    try:
        for label, home, jar in configs:
            port = free_port()
            app = subprocess.Popen([str(pathlib.Path(home) / "bin" / ("java" + EXE)), "-jar", jar],
                                   env={**env(), "PORT": str(port), "DOWNSTREAM_PORT": str(dport)},
                                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
            try:
                wait_http(f"http://127.0.0.1:{port}/fanout")
                jdk = call(port, "rt-loop", 1)["jdk"]
                for n in sizes:
                    for s in MAIN:
                        if s == "rt-loop" and n != min(sizes):
                            continue
                        if ("vt" in s) and jdk < 21:
                            continue
                        record(label, measure(port, s, n, a.runs), "main")
                for s in CONTEXT:
                    if ("vt" in s) and jdk < 21:
                        continue
                    record(label, measure(port, s, 50, 1), "context")
                ex = "rc-vt-limit" if jdk >= 21 else "rc-pool"   # limit 200: compare factories, not connection storms
                for f in FACTORIES:
                    record(label, measure(port, ex, max(sizes), a.runs, f), "factory")
            finally:
                app.terminate()
                app.wait(timeout=30)
    finally:
        echo.terminate()
    pathlib.Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    with open(a.out, "w") as f:
        for r in results:
            f.write(json.dumps(r) + "\n")
    print(f"wrote {len(results)} results to {a.out}")


if __name__ == "__main__":
    main()

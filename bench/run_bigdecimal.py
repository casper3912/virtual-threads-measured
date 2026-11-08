"""Run the CPU-bound BigDecimal summation benchmark on one or more JDKs.

    python bench/run_bigdecimal.py --machine desktop --jdk 21=<jdk21 home> --jdk 27=<jdk27 home>

Writes out/bigdec-<machine>-<jdk>.txt, one file per JDK, holding the three task shapes
(10,000 x 1,000, 100,000 x 100 and 100 x 100,000 numbers). Each JDK takes about 80 s
on a 16-thread desktop; build.py renders the tables from these files.
"""
import argparse, os, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHAPES = [(10_000, 1_000), (100_000, 100), (100, 100_000)]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--machine", required=True, choices=["desktop", "container"])
    ap.add_argument("--jdk", action="append", required=True, help="LABEL=JAVA_HOME")
    ap.add_argument("--runs", type=int, default=7)
    a = ap.parse_args()
    env = dict(os.environ)
    env.pop("JAVA_TOOL_OPTIONS", None)  # its "Picked up ..." banner would land in the output
    for spec in a.jdk:
        label, home = spec.split("=", 1)
        java = pathlib.Path(home) / "bin" / ("java.exe" if os.name == "nt" else "java")
        parts = []
        for tasks, per in SHAPES:
            cmd = [str(java), "-Xmx4g", str(ROOT / "bench" / "BigDecimalBench.java"), str(tasks), str(per), str(a.runs)]
            print("running", " ".join(cmd), flush=True)
            r = subprocess.run(cmd, capture_output=True, text=True, env=env)
            if r.returncode != 0:
                sys.exit(f"JDK {label} {tasks}x{per} failed:\n{r.stdout}\n{r.stderr}")
            parts.append(r.stdout.strip())
        dest = ROOT / "out" / f"bigdec-{a.machine}-{label}.txt"
        dest.write_text("\n----\n".join(parts) + "\n", encoding="utf-8", newline="\n")
        print("wrote", dest, flush=True)

if __name__ == "__main__":
    main()

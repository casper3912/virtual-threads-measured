"""Probe: at what cold fan-out size does a fresh app start getting 'Connection refused' from the downstream?
Each size gets a freshly started app (empty connection pool), then one call with no warm-up.

  python spring/storm_probe.py <jdk25 home> <jar> 100 200 300 500 1000
Set ECHO_JAVA_HOME to run the downstream echo server on a different JDK than the app
(JDK-8330940, integrated for JDK 26, lets a Java server's listen backlog exceed 200 on Windows).
"""
import json, os, pathlib, socket, subprocess, sys, time, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
EXE = ".exe" if os.name == "nt" else ""
HDR = {"X-Request-Id": "req-7f3a", "X-Tenant-Id": "acme", "Authorization": "Bearer tok-55a54008",
       "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"}


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    home, jar, sizes = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3:]]
    java = str(pathlib.Path(home) / "bin" / ("java" + EXE))
    echo_java = str(pathlib.Path(os.environ.get("ECHO_JAVA_HOME", home)) / "bin" / ("java" + EXE))
    env = {k: v for k, v in os.environ.items() if k not in ("JAVA_TOOL_OPTIONS", "ECHO_JAVA_HOME")}
    dport = free_port()
    echo = subprocess.Popen([echo_java, "-Dsun.net.httpserver.maxIdleConnections=20000", "-Dsun.net.httpserver.idleInterval=600",
                             "-cp", str(HERE / "build"), "EchoServer", str(dport), "20"], stdout=subprocess.PIPE, text=True, env=env)
    echo.stdout.readline()
    try:
        for scenario in os.environ.get("PROBE_SCENARIOS", "rc-vt,rc-vt-limit").split(","):
            for n in sizes:
                port = free_port()
                app = subprocess.Popen([java, "-jar", jar], env={**env, "PORT": str(port), "DOWNSTREAM_PORT": str(dport)},
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                try:
                    for _ in range(180):
                        try:
                            urllib.request.urlopen(f"http://127.0.0.1:{port}/fanout", timeout=2)
                        except urllib.error.HTTPError:
                            break
                        except Exception:
                            time.sleep(0.5)
                    req = urllib.request.Request(f"http://127.0.0.1:{port}/fanout?scenario={scenario}&n={n}", headers=HDR)
                    r = json.loads(urllib.request.urlopen(req, timeout=300).read())
                    print(json.dumps({"probe": "cold-storm", "echoJdk": pathlib.Path(echo_java).parent.parent.name, "scenario": scenario, "n": n, "ms": r.get("ms"),
                                      "forwarded": r.get("forwarded"), "calls": r["calls"], "error": r.get("error")}), flush=True)
                finally:
                    app.terminate()
                    app.wait(timeout=30)
    finally:
        echo.terminate()


if __name__ == "__main__":
    main()

"""Assemble virtual-threads.html from src/page.html + lab sources + captured outputs.
Refuses to build if any placeholder is unresolved or any output file is missing."""
import html, json, re, sys, pathlib

ROOT = pathlib.Path(__file__).parent
LABS, OUT = ROOT / "labs", ROOT / "out"
page = (ROOT / "src/page.html").read_text(encoding="utf-8")

QUIZ = [
 {"q":"A service's handlers spend 95% of their time waiting on a database. What do virtual threads most likely improve?","o":["Latency of each request","Throughput when many requests are in flight","CPU efficiency of the queries"],"a":1,"why":"They raise the number of requests that can wait at once. Each request still takes as long as its database call (Lab 2)."},
 {"q":"On JDK 25, a virtual thread calls Thread.sleep inside a synchronized block. What happens to its carrier?","o":["It's pinned for the sleep","It's released; the virtual thread unmounts","The JVM throws an exception"],"a":1,"why":"JEP 491 (JDK 24) lets virtual threads unmount while holding a monitor (Lab 4)."},
 {"q":"Which still pins a virtual thread on JDK 25?","o":["Blocking inside synchronized","Blocking in Object.wait()","Blocking inside a native (JNI/FFM) frame"],"a":2,"why":"Native frames can't be moved to the heap, so they pin on every JDK."},
 {"q":"You must not exceed 20 concurrent calls to a partner API. Best approach with virtual threads?","o":["Executors.newFixedThreadPool(20) with a virtual thread factory","newVirtualThreadPerTaskExecutor() plus a Semaphore(20) around the call","Set jdk.virtualThreadScheduler.parallelism=20"],"a":1,"why":"Limit the resource, not the threads. The parallelism setting changes carriers and doesn't bound concurrent calls (Lab 6)."},
 {"q":"A CPU-bound image resize job runs 8 tasks on a 4-core box. Compared to a 4-thread pool, virtual threads will be…","o":["About the same","About 2× faster","Much slower"],"a":0,"why":"Same cores, same work (Lab 3). They're not time-sliced, so there's no magic."},
 {"q":"How many carrier threads does the default scheduler use?","o":["One per virtual thread","About one per available core","A fixed 256"],"a":1,"why":"Parallelism defaults to the number of available processors. 256 is the default maximum pool size, used only to compensate for some blocking."},
 {"q":"Which tool should you use to find pinning on JDK 24+?","o":["-Djdk.tracePinnedThreads=full","JFR's jdk.VirtualThreadPinned event","jstack"],"a":1,"why":"The trace flag was removed in 24, and on 21 it changed the timing we measured. JFR is the supported signal (Lab 10)."},
 {"q":"Which of these can you use in production on JDK 25 without preview flags?","o":["ScopedValue","StructuredTaskScope","Both"],"a":0,"why":"ScopedValue is final in 25 (JEP 506). StructuredTaskScope is still preview, and its API changed again in 27 (Labs 7 and 8)."},
]

def quiz_html():
    parts = []
    for qi, item in enumerate(QUIZ):
        parts.append(f'<div class="q" id="q{qi}"><p>{qi+1}. {html.escape(item["q"])}</p>')
        for oi, opt in enumerate(item["o"]):
            parts.append(f'<label><input type="radio" name="q{qi}" value="{oi}"> {html.escape(opt)}</label>')
        parts.append(f'<details class="ans"><summary>Answer</summary>{html.escape(item["o"][item["a"]])}. {html.escape(item["why"])}</details>')
        parts.append('<div class="fb" aria-live="polite"></div></div>')
    return "\n".join(parts)

def src(name):
    for d in (LABS, ROOT / "guard", ROOT / "bench", ROOT / "spring", ROOT / "spring/src/main/java/demo"):
        if (d / name).exists():
            return html.escape((d / name).read_text(encoding="utf-8").rstrip())
    sys.exit(f"missing source {name}")


# ---------- GET benchmark ----------
METHODS = [
    ("loop", "for loop (sequential)"), ("cf-async", "CompletableFuture + sendAsync"),
    ("cf-pool", "CompletableFuture + 64-thread pool"), ("cf-common", "CompletableFuture + common pool"),
    ("vt", "Virtual threads"), ("vt-vtclient", "VT + client on VT executor"),
    ("vt-sync", "VT + synchronized wrapper"), ("sts", "StructuredTaskScope + ScopedValue"),
    ("vt-scoped", "VT executor + ScopedValue"),
]
LABEL = dict(METHODS)
def load(name):
    return [json.loads(l) for l in (OUT / name).read_text(encoding="utf-8").splitlines() if l.strip()]
BENCH = {"container": load("bench.jsonl"), "desktop": load("bench-desktop.jsonl")}
MACHINES = {m: {"jdks": sorted({r["jdk"] for r in rows})} for m, rows in BENCH.items()}

def find(machine, jdk, method, n, mode=None):
    for r in BENCH[machine]:
        if r["jdk"] == jdk and r["method"] == method and r["n"] == n and (r["mode"] != "threadlocal" if mode is None else r["mode"] == mode):
            return r
    sys.exit(f"no bench result {machine} {jdk} {method} {n} {mode}")

def ms(v):
    return f"{v/1000:.1f} s" if v >= 2000 else f"{v:,} ms"

def bench_table(machine):
    jdks = MACHINES[machine]["jdks"]; sizes = sorted({r["n"] for r in BENCH[machine] if r["mode"] != "threadlocal"})
    head = "<tr><th>Method</th>" + "".join(f"<th>JDK {j}<br><span class='small'>N={n}</span></th>" for j in jdks for n in sizes) + "</tr>"
    rows = []
    for mid, label in METHODS:
        cells = []
        for j in jdks:
            for n in sizes:
                r = next((x for x in BENCH[machine] if x["jdk"] == j and x["method"] == mid and x["n"] == n and x["mode"] != "threadlocal"), None)
                if r is None:
                    cells.append("<td class='small'>not run</td>" if not (mid in ("sts", "vt-scoped") and j < 25) else "<td class='small'>needs 25+</td>")
                elif r.get("error"):
                    cells.append("<td><span class='no'>failed</span><br><span class='small'>thread limit exceeded</span></td>")
                else:
                    lost = r["forwarded"] != r["calls"]
                    cells.append(f"<td>{ms(r['medianMs'])}<br><span class='small'>{r['peakPlatformThreads']} thr</span>"
                                 + (f"<br><span class='no'>headers {r['forwarded']}/{r['calls']}</span>" if lost else "") + "</td>")
        rows.append(f"<tr><td>{label}</td>{''.join(cells)}</tr>")
    note = "<p class='small'>“not run”: the sequential loop was only measured at N=200. At N=1,000 it would take about 2,000 × the per-call time (over a minute) and tells you nothing new.</p>"
    return f"<div class='tablewrap'><table>{head}{''.join(rows)}</table></div>{note}"

def ctx_table():
    cols = [("container", j) for j in MACHINES["container"]["jdks"]] + [("desktop", j) for j in MACHINES["desktop"]["jdks"]]
    head = "<tr><th>Method, and how it finds the context</th>" + "".join(
        f"<th>{'Cloud' if m=='container' else 'Desktop'}<br>JDK {j}</th>" for m, j in cols) + "</tr>"
    rows = []
    def cell(r):
        if r is None: return "<td class='small'>needs 25+</td>"
        cls = "ok" if r["forwarded"] == r["calls"] else "no"
        return f"<td><span class='{cls}'>{r['forwarded']}/{r['calls']}</span></td>"
    for mid, label in METHODS[:7]:
        rows.append(f"<tr><td>{label} · <code>ThreadLocal</code></td>" + "".join(cell(find(m, j, mid, 50, "threadlocal")) for m, j in cols) + "</tr>")
    for mid, label in METHODS[7:]:
        rows.append(f"<tr><td>{label}</td>" + "".join(
            cell(next((x for x in BENCH[m] if x["jdk"] == j and x["method"] == mid and x["n"] == 200), None)) for m, j in cols) + "</tr>")
    return (f"<div class='tablewrap'><table>{head}{''.join(rows)}</table></div>"
            "<p class='small'>Calls whose four headers all arrived. ThreadLocal rows: N=50 (100 calls). ScopedValue rows: N=200 (400 calls).</p>")

def bnum(m):
    machine, jdk, method, n = m.group(2).split(":")
    r = find(machine, int(jdk), method, int(n))
    if r.get("error"):
        sys.exit(f"placeholder points at a failed run: {m.group(0)}")
    return ms(r["medianMs"]) if m.group(1) == "B" else f"{r['peakPlatformThreads']:,}"

# ---------- Spring benchmark ----------
SPRING = [json.loads(l) for l in (OUT / "spring-bench.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
if (OUT / "spring-bench-desktop.jsonl").exists():
    SPRING += [json.loads(l) for l in (OUT / "spring-bench-desktop.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
SCONF = {"Java 17 + Boot 3.5": "j17b3", "Java 25 + Boot 3.5": "j25b3", "Java 25 + Boot 4.1": "j25b4"}
for r in SPRING:
    r["key"] = SCONF[r["config"]]
SCONFIGS = list(dict.fromkeys(r["config"] for r in SPRING))
SLABEL = {
    "rt-loop": "RestTemplate · for loop", "rt-boot8": "RestTemplate · 8-thread pool (Boot default shape)",
    "rt-pool": "RestTemplate · 64-thread pool", "rc-pool": "RestClient · 64-thread pool",
    "rt-vt": "RestTemplate · virtual-thread bean", "rc-vt": "RestClient · virtual-thread bean",
    "rc-vt-explicit": "RestClient · virtual threads, explicit headers (no ThreadLocal)",
    "rc-vt-limit": "RestClient · virtual-thread bean, limit 200",
    "rt-pool-nodec": "RestTemplate · 64-thread pool, no TaskDecorator", "rc-vt-nodec": "RestClient · virtual-thread bean, no TaskDecorator",
}
FLABEL = {"hc5-default": "HttpClient 5, default pool (what RestClient.create() picks)", "simple": "HttpURLConnection (what new RestTemplate() uses)",
          "jdk": "java.net.http HttpClient", "hc5-tuned": "HttpClient 5, pool sized to 1,000"}

def sfind(key, scenario, n, kind="main", factory="hc5-tuned", machine="container"):
    for r in SPRING:
        if r["machine"] == machine and r["key"] == key and r["scenario"] == scenario and r["n"] == n and r["kind"] == kind and r.get("factory") == factory:
            return r
    return None

def scell(r, show_fwd=True):
    if r is None:
        return "<td class='small'>—</td>"
    if r.get("error"):
        reason = "connection refused" if "refused" in r["error"].lower() else html.escape(r["error"].split(":")[0])
        return f"<td><span class='no'>failed</span><br><span class='small'>{reason}</span></td>"
    lost = r["forwarded"] != r["calls"]
    return f"<td>{ms(r['medianMs'])}" + (f"<br><span class='no'>headers {r['forwarded']}/{r['calls']}</span>" if lost and show_fwd else "") + "</td>"

def spring_main(machine):
    sizes = [200, 1000]
    head = "<tr><th>Client · executor</th>" + "".join(f"<th>{c.replace(' + ', '<br>')}<br><span class='small'>N={n}</span></th>" for c in SCONFIGS for n in sizes) + "</tr>"
    rows = []
    for sc in ["rt-loop", "rt-boot8", "rt-pool", "rc-pool", "rt-vt", "rc-vt", "rc-vt-limit", "rc-vt-explicit"]:
        cells = []
        for c in SCONFIGS:
            for n in sizes:
                r = sfind(SCONF[c], sc, n, machine=machine)
                if r is None and "vt" in sc and c.startswith("Java 17"):
                    cells.append("<td class='small'>needs 21+</td>")
                elif r is None:
                    cells.append("<td class='small'>not run</td>")
                else:
                    cells.append(scell(r))
        rows.append(f"<tr><td>{SLABEL[sc]}</td>{''.join(cells)}</tr>")
    return f"<div class='tablewrap'><table>{head}{''.join(rows)}</table></div><p class='small'>“not run”: the sequential loop only at N=200 (it took 8–12 s there).</p>"

def spring_factory(machine):
    head = "<tr><th>Request factory</th>" + "".join(f"<th>{c}<br><span class='small'>{'64-thread pool' if c.startswith('Java 17') else 'virtual threads, limit 200'}</span></th>" for c in SCONFIGS) + "</tr>"
    rows = []
    for f in ["hc5-default", "simple", "jdk", "hc5-tuned"]:
        cells = "".join(scell(next((r for r in SPRING if r["machine"] == machine and r["key"] == SCONF[c] and r["kind"] == "factory" and r["factory"] == f), None)) for c in SCONFIGS)
        rows.append(f"<tr><td>{FLABEL[f]}</td>{cells}</tr>")
    return f"<div class='tablewrap'><table>{head}{''.join(rows)}</table></div>"

def spring_context():
    machines = [m for m in ("desktop", "container") if any(r["machine"] == m for r in SPRING)]
    cols = [(m, c) for m in machines for c in SCONFIGS]
    head = "<tr><th>Setup</th>" + "".join(f"<th>{'Desktop' if m == 'desktop' else 'Cloud'}<br>{c}</th>" for m, c in cols) + "</tr>"
    rows = []
    spec = [("rt-pool-nodec", 50, "context"), ("rc-vt-nodec", 50, "context"), ("rt-pool", 200, "main"), ("rc-vt", 200, "main"), ("rc-vt-explicit", 200, "main")]
    for sc, n, kind in spec:
        cells = []
        for m, c in cols:
            r = sfind(SCONF[c], sc, n, kind, machine=m)
            if r is None:
                cells.append("<td class='small'>needs 21+</td>" if c.startswith("Java 17") else "<td>—</td>")
            else:
                cls = "ok" if r["forwarded"] == r["calls"] else "no"
                cells.append(f"<td><span class='{cls}'>{r['forwarded']}/{r['calls']}</span></td>")
        label = SLABEL[sc] + ("" if "nodec" in sc or "explicit" in sc else " + TaskDecorator")
        rows.append(f"<tr><td>{label}</td>{''.join(cells)}</tr>")
    return f"<div class='tablewrap'><table>{head}{''.join(rows)}</table></div><p class='small'>Calls whose four headers all arrived downstream.</p>"

def read_any(path):
    b = path.read_bytes()
    if b[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return b.decode("utf-16")
    return b.decode("utf-8", errors="ignore")

STORM_FILES = (("desktop", "storm-probe-desktop.log"), ("desktop", "storm-probe-desktop-echo26.log"), ("container", "storm-probe.log"))

def storm_rows():
    out = []
    for machine, f in STORM_FILES:
        if (OUT / f).exists():
            for l in read_any(OUT / f).splitlines():
                l = l.strip().lstrip("\ufeff")
                if l.startswith("{"):
                    r = json.loads(l); r["machine"] = machine; out.append(r)
    return out

def storm_table(include_echo26=True):
    rows = {}
    for r in storm_rows():
        if r.get("echoJdk") and not include_echo26:
            continue
        rows.setdefault((r["machine"], r.get("echoJdk"), r["scenario"]), {})[r["n"]] = r
    sizes = sorted({n for d in rows.values() for n in d})
    head = "<tr><th>Machine · server JDK · executor</th>" + "".join(f"<th>N={n}<br><span class='small'>{2*n} calls</span></th>" for n in sizes) + "</tr>"
    body = []
    for (machine, echo, sc), d in rows.items():
        server = "server on JDK 26" if echo == "openjdk-26" else "server on JDK 25"
        label = ("Desktop (Windows 11)" if machine == "desktop" else "Cloud (Linux)") + " · " + server + " · " + ("no limit" if sc == "rc-vt" else "limit 200")
        cells = []
        for n in sizes:
            r = d.get(n)
            if r is None: cells.append("<td class='small'>—</td>")
            elif r.get("error"): cells.append("<td><span class='no'>connection refused</span></td>")
            else: cells.append(f"<td><span class='ok'>{r['forwarded']}/{r['calls']}</span><br><span class='small'>{ms(r['ms'])}</span></td>")
        body.append(f"<tr><td>{label}</td>{''.join(cells)}</tr>")
    return f"<div class='tablewrap'><table>{head}{''.join(body)}</table></div>"

STORM = storm_rows()

def snum(m):
    parts = m.group(1).split(":")
    machine = parts.pop(0) if parts[0] in ("desktop", "container") else "container"
    key, sc, n = parts
    r = sfind(key, sc, int(n), machine=machine)
    if r is None or r.get("error"):
        sys.exit(f"bad spring placeholder {m.group(0)}")
    return ms(r["medianMs"])

# ---------- Slides tab ----------
import base64
def slides_section():
    sdir = ROOT / "slides"
    notes = json.loads((sdir / "notes.json").read_text(encoding="utf-8"))
    deck = (sdir / "virtual-threads-measured.pptx").read_bytes()
    figs = []
    for s_ in notes:
        img = sdir / "img" / f"slide-{s_['n']:02d}.webp"
        if not img.exists():
            sys.exit(f"missing slide image {img}; run slides/render.py")
        b64 = base64.b64encode(img.read_bytes()).decode()
        t = html.escape(s_["title"] or f"Slide {s_['n']}")
        figs.append(f'<figure id="slide-{s_["n"]}"><img src="data:image/webp;base64,{b64}" alt="Slide {s_["n"]}: {t}" width="1280" height="720" loading="lazy">'
                    f'<figcaption>{s_["n"]}. {t}</figcaption><details><summary>Speaker notes</summary><div class="notes">{html.escape(s_["notes"])}</div></details></figure>')
    href = "data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64," + base64.b64encode(deck).decode()
    return f"""<section id="slides" class="wrap slides-panel" role="tabpanel" aria-labelledby="tab-slides">
<h2 id="slides-h">The talk: Virtual Threads, Measured</h2>
<p>{len(notes)} slides with speaker notes, presented November 11, 2026. Click the slide or use the arrow keys to move through it; F goes full screen. The PowerPoint has native charts built from the same measured results as this page, plus clickable references: <a id="pptx-download" download="virtual-threads-measured.pptx" href="{href}">download the .pptx ({len(deck)//1024} KB)</a>.</p>
<div id="sv" class="sv" hidden>
<div id="sv-stage" class="sv-stage" title="Click for the next slide"><img id="sv-img" alt="" width="1280" height="720"></div>
<div class="sv-bar"><button type="button" class="ghost" id="sv-prev" aria-label="Previous slide">&larr; Prev</button><span class="count" id="sv-count" aria-live="polite"></span><button type="button" class="ghost" id="sv-next" aria-label="Next slide">Next &rarr;</button><span class="ttl" id="sv-title"></span><label class="small"><input type="checkbox" id="sv-notes-toggle" checked> Speaker notes</label><button type="button" class="ghost" id="sv-full">Full screen</button></div>
<div class="sv-notes" id="sv-notes"></div>
<div class="sv-thumbs" id="sv-thumbs" aria-label="All slides"></div>
</div>
<div id="slide-list" class="slide-list">
{chr(10).join(figs)}
</div>
</section>"""

def per_call(machine):
    r = find(machine, 21, "loop", 200)
    return f"{r['medianMs'] / r['calls']:.1f}"


def out(name):
    p = OUT / f"{name}.txt"
    if not p.exists():
        sys.exit(f"missing output {p}")
    text = p.read_text(encoding="utf-8").rstrip()
    if not text:
        sys.exit(f"empty output {p}")
    return html.escape(text)

page = re.sub(r"\{\{INCLUDE:([^}]+)\}\}", lambda m: (ROOT / "src" / m.group(1)).read_text(encoding="utf-8"), page)
page = re.sub(r"\{\{BENCH_TABLE:([a-z]+)\}\}", lambda m: bench_table(m.group(1)), page)
page = page.replace("{{CTX_TABLE}}", ctx_table())
page = re.sub(r"\{\{SPRING_MAIN:([a-z]+)\}\}", lambda m: spring_main(m.group(1)), page)
page = re.sub(r"\{\{SPRING_FACTORY:([a-z]+)\}\}", lambda m: spring_factory(m.group(1)), page)
page = page.replace("{{SPRING_CONTEXT}}", spring_context())
page = page.replace("{{SLIDES_SECTION}}", slides_section())
page = page.replace("{{STORM_TABLE}}", storm_table(True)).replace("{{STORM_TABLE_SMALL}}", storm_table(False))
page = page.replace("{{STORM_JSON}}", json.dumps(STORM))
page = re.sub(r"\{\{S:([^}]+)\}\}", snum, page)
page = page.replace("{{SPRING_JSON}}", json.dumps(SPRING).replace("</", "<\\/"))
page = re.sub(r"\{\{(BT?):([^}]+)\}\}", bnum, page)
page = re.sub(r"\{\{PER_CALL:([a-z]+)\}\}", lambda m: per_call(m.group(1)), page)
page = page.replace("{{BENCH_JSON}}", json.dumps({"methods": [{"id": i, "label": l} for i, l in METHODS],
                                                  "machines": MACHINES, "data": BENCH}).replace("</", "<\\/"))
page = re.sub(r"\{\{SRC:([^}]+)\}\}", lambda m: src(m.group(1)), page)
page = re.sub(r"\{\{OUT:([^}]+)\}\}", lambda m: out(m.group(1)), page)
page = re.sub(r"\{\{OUT_INLINE:([^}]+)\}\}", lambda m: "<code>" + out(m.group(1)).replace("\n", " · ") + "</code>", page)
page = page.replace("{{QUIZ_HTML}}", quiz_html())
page = page.replace("{{QUIZ_JSON}}", json.dumps(QUIZ, ensure_ascii=False).replace("</", "<\\/"))
page = page.replace("{{MACHINE}}", "a 2-vCPU Intel Xeon @ 2.30 GHz Linux container")
page = page.replace("{{JDKS}}", "21.0.12 (Ubuntu), Temurin 25.0.5 LTS and Temurin 27.0.1")
# The build date lives in a file, not the clock, so CI can rebuild byte-for-byte and diff against the committed page.
page = page.replace("{{BUILT}}", (ROOT / "src/build-date.txt").read_text(encoding="utf-8").strip())

left = re.findall(r"\{\{[A-Z_]+[^}]*\}\}", page)
if left:
    sys.exit(f"unresolved placeholders: {left}")
# index.html is the published page and the emailable single file; LF endings on every OS keep the CI diff honest.
dest = ROOT / "index.html"
dest.write_text(page, encoding="utf-8", newline="\n")
print(f"built {dest} ({len(page.encode())//1024} KB)")

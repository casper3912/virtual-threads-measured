// Builds slides/virtual-threads-measured.pptx from the same measured results the site uses (out/*.jsonl).
// Run from the repo root:  node slides/build_deck.js
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
// Theme colors are written into the .pptx after pptxgenjs saves it. That helper isn't part of this repo:
// set PPTX_APPLY_THEME to a module exporting applyTheme(file, theme), or the deck keeps Office's stock palette.
const applyTheme = process.env.PPTX_APPLY_THEME ? require(process.env.PPTX_APPLY_THEME).applyTheme
  : async () => console.warn("PPTX_APPLY_THEME not set: theme colors not applied");

const ROOT = path.resolve(__dirname, "..");
const jsonl = f => fs.readFileSync(path.join(ROOT, "out", f), "utf8").split(/\r?\n/).filter(l => l.trim().startsWith("{")).map(JSON.parse);
const BENCH_D = jsonl("bench-desktop.jsonl");
const SPRING_D = jsonl("spring-bench-desktop.jsonl");
const txt = f => fs.readFileSync(path.join(ROOT, "out", f), "utf8");
const msFrom = s => parseInt(s.match(/took (\d+) ms/)[1], 10);

function bench(jdk, method, n, mode = "explicit") {
  const r = BENCH_D.find(x => x.jdk === jdk && x.method === method && x.n === n && x.mode === mode);
  if (!r) throw new Error(`missing bench ${jdk} ${method} ${n}`);
  return r;
}
function spring(config, scenario, n, kind = "main", factory = "hc5-tuned") {
  const r = SPRING_D.find(x => x.config === config && x.scenario === scenario && x.n === n && x.kind === kind && x.factory === factory);
  if (!r) throw new Error(`missing spring ${config} ${scenario} ${n} ${kind} ${factory}`);
  return r;
}

// ------------------------------------------------------------------ theme
const THEME = {
  name: "Virtual Threads Measured",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "17262B", lt1: "FFFFFF", dk2: "0F4C5C", lt2: "EAF2F3",
    accent1: "0F4C5C", accent2: "E3A13B", accent3: "B5452F", accent4: "5E8C61",
    accent5: "7A9EA6", accent6: "3A3F44", hlink: "0F6E85", folHlink: "6B4E8A",
  },
};
const HEX = { teal: "0F4C5C", amber: "E3A13B", red: "B5452F", green: "5E8C61", slate: "7A9EA6", ink: "17262B", grid: "D7E3E5", mute: "5B6B70", tint: "EAF2F3" };

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.title = "Virtual Threads, Measured";
pres.author = "Michael Martin";
pres.subject = "Java virtual threads: what they fix, what breaks, and how to migrate";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

const FOOT = { text: "Virtual Threads, Measured", options: { x: 0.6, y: 7.0, w: 6, h: 0.3, fontSize: 10, color: C.text2 } };

pres.defineSlideMaster({
  title: "Title Dark", background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.2, w: 11.7, h: 1.6, fontSize: 48, bold: true, color: C.background1, valign: "bottom" }, text: "Title" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 4.0, w: 11.7, h: 1.6, fontSize: 20, color: C.background2, valign: "top" }, text: "Subtitle" } },
  ],
});
pres.defineSlideMaster({
  title: "Section Dark", background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.6, w: 11.7, h: 1.2, fontSize: 40, bold: true, color: C.background1, valign: "bottom" }, text: "Section" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.9, w: 11.7, h: 1.2, fontSize: 20, color: C.background2, valign: "top" }, text: "Lead-in" } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: C.background2, align: "right" },
});
pres.defineSlideMaster({
  title: "Title Only", background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.4, w: 12.1, h: 0.9, fontSize: 30, bold: true, color: C.text2, valign: "middle" }, text: "Title" } },
    { text: FOOT },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: C.text2, align: "right" },
});

let section = "";
function slide(master, sec) {
  if (sec && sec !== section) { pres.addSection({ title: sec }); section = sec; }
  return pres.addSlide({ masterName: master, sectionTitle: section });
}
function card(s, name, x, y, w, h, fill = C.background2) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { objectName: name, x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: fill } });
}
function numBadge(s, name, n, x, y, fill = C.accent2) {
  s.addShape(pres.shapes.OVAL, { objectName: name + " badge", x, y, w: 0.55, h: 0.55, fill: { color: fill }, line: { color: fill } });
  s.addText(String(n), { objectName: name + " number", isTextBox: true, x, y, w: 0.55, h: 0.55, fontSize: 18, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0 });
}
function para(s, name, runs, x, y, w, h, extra = {}) {
  s.addText(runs, Object.assign({ objectName: name, isTextBox: true, x, y, w, h, fontSize: 16, color: C.text1, valign: "top", margin: 0.05, paraSpaceAfter: 6 }, extra));
}
function bullets(items, size = 16) {
  return items.map((t, i) => ({ text: t, options: { bullet: true, fontSize: size, breakLine: i < items.length - 1, paraSpaceAfter: 8 } }));
}
function code(s, name, text, x, y, w, h, size = 13) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { objectName: name + " panel", x, y, w, h, rectRadius: 0.08, fill: { color: C.text1 }, line: { color: C.text1 } });
  s.addText(text, { objectName: name, isTextBox: true, x: x + 0.15, y: y + 0.1, w: w - 0.3, h: h - 0.2, fontFace: "Courier New", fontSize: size, color: C.background1, valign: "top", margin: 0.05 });
}
const AX = { catAxisLabelColor: HEX.ink, valAxisLabelColor: HEX.mute, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", catAxisLabelFontSize: 13, valAxisLabelFontSize: 11,
  valGridLine: { color: HEX.grid, size: 0.75 }, catGridLine: { style: "none" }, dataLabelFontFace: "+mn-lt", dataLabelFontSize: 12, dataLabelColor: HEX.ink,
  titleFontFace: "+mn-lt", titleFontSize: 14, titleColor: HEX.ink };

// ------------------------------------------------------------------ 1 title
{
  const s = slide("Title Dark", "Opening");
  s.addText("Virtual Threads, Measured", { placeholder: "title" });
  s.addText([
    { text: "What they fix, what breaks, and how to migrate Spring services from Java 17 to 25", options: { breakLine: true } },
    { text: "Michael Martin  ·  November 11, 2026", options: { fontSize: 16 } },
  ], { placeholder: "body" });
  s.addNotes("Every number in this talk came from a program I ran on JDK 17, 21, 25, 26 and 27, on a 16-thread Windows desktop and a 2-core Linux machine. The full write-up, the code and the raw results are on the site at the end. Plan: why virtual threads exist, how they work, the version that matters, a GET-request benchmark with header forwarding, then the Spring migration we're actually facing.");
}

// ------------------------------------------------------------------ 2 one sentence
{
  const s = slide("Title Only", "Opening");
  s.addText("The one sentence to remember", { placeholder: "title" });
  card(s, "Key message card", 0.6, 1.7, 12.1, 2.4, C.text2);
  s.addText([
    { text: "Virtual threads make ", options: {} },
    { text: "waiting", options: { bold: true, color: C.accent2 } },
    { text: " cheap. They don't make ", options: {} },
    { text: "computing", options: { bold: true, color: C.accent2 } },
    { text: " faster.", options: {} },
  ], { objectName: "Key message", isTextBox: true, x: 1.0, y: 1.9, w: 11.3, h: 2.0, fontFace: "Cambria", fontSize: 36, color: C.background1, valign: "middle", margin: 0 });
  const items = [
    ["Good fit", "Many tasks that mostly wait: HTTP handlers, calls to databases and services, fan-out to several backends"],
    ["No gain", "CPU-bound work, a few long-lived threads, code that's already non-blocking end to end"],
    ["Not magic", "Not time-sliced: a thread that never blocks keeps its carrier until it finishes"],
  ];
  items.forEach(([h, b], i) => {
    const x = 0.6 + i * 4.1;
    card(s, `Point ${i + 1} card`, x, 4.5, 3.9, 2.2);
    para(s, `Point ${i + 1}`, [{ text: h, options: { bold: true, fontSize: 20, color: C.text2, breakLine: true } }, { text: b, options: { fontSize: 15 } }], x + 0.25, 4.7, 3.4, 1.9);
  });
  s.addNotes("If people remember one thing, make it this. Virtual threads don't run your code faster. They let you have tens of thousands of threads that are mostly waiting, so a thread-per-request style stops hitting a thread ceiling. Everything else in the talk follows from that.");
}

// ------------------------------------------------------------------ 3 Little's law
{
  const s = slide("Title Only", "Why they exist");
  s.addText("A thread pool caps throughput, and Little's law says where", { placeholder: "title" });
  para(s, "Little's law", [
    { text: "Requests in flight = rate × time each one waits", options: { bold: true, fontSize: 20, color: C.text2, breakLine: true } },
    { text: "With thread-per-request, every request in flight holds a thread. So a 200-thread pool serving calls that wait 100 ms can never exceed 2,000 requests per second, however idle the CPU is.", options: { fontSize: 16 } },
  ], 0.6, 1.6, 5.4, 2.4);
  card(s, "Stat card", 0.6, 4.2, 5.4, 2.4, C.background2);
  s.addText([{ text: "10,000 tasks × 100 ms", options: { fontSize: 18, color: C.text2, bold: true, breakLine: true } },
    { text: "200-thread pool: 5.0 s  ·  virtual threads: 0.18 s", options: { fontSize: 16, breakLine: true } },
    { text: "The pool's time is exactly what Little's law predicts: 10,000 × 0.1 s ÷ 200.", options: { fontSize: 14, color: C.text2 } }],
    { objectName: "Lab 2 stat", isTextBox: true, x: 0.85, y: 4.4, w: 5.0, h: 2.0, valign: "top", margin: 0, paraSpaceAfter: 6 });
  const l2 = txt("L2-25.txt");
  const pool = parseInt(l2.match(/platform threads\s+(\d+) ms/)[1], 10), vt = parseInt(l2.match(/per task\s+(\d+) ms/)[1], 10);
  s.addChart(pres.charts.BAR, [{ name: "Time (ms)", labels: ["Fixed pool, 200 platform threads", "One virtual thread per task"], values: [pool, vt] }], Object.assign({
    objectName: "Lab 2 chart", x: 6.5, y: 1.6, w: 6.2, h: 5.0, barDir: "bar", chartColors: [HEX.slate, HEX.teal], showValue: true, dataLabelPosition: "outEnd",
    dataLabelFormatCode: "#,##0 \"ms\"", showLegend: false, showTitle: true, title: "Lab 2: 10,000 tasks that each wait 100 ms (JDK 25)", valAxisHidden: true, catAxisOrientation: "maxMin",
  }, AX));
  s.addNotes(`Little's law ties the thread limit to throughput. Lab 2 makes it concrete: 10,000 tasks that each block for 100 ms took ${pool} ms on a 200-thread pool and ${vt} ms with one virtual thread per task. The pool number is just 10,000 times 0.1 s divided by 200 threads. The calculator on the site lets you plug in your own service's numbers.`);
}

// ------------------------------------------------------------------ 4 mental model
{
  const s = slide("Title Only", "Why they exist");
  s.addText("Mount, run, unmount on block, remount anywhere", { placeholder: "title" });
  const steps = [
    ["Mount", "The scheduler copies a runnable virtual thread's stack onto a carrier: a platform thread from a small ForkJoinPool, one per core."],
    ["Run", "Your code executes on the carrier like any other Java code."],
    ["Block → unmount", "On a socket read, sleep, lock or queue wait, the stack moves to the heap and the carrier is freed for someone else."],
    ["Unblock → remount", "When the I/O completes, the thread is mounted on whichever carrier is free, possibly a different one."],
  ];
  steps.forEach(([h, b], i) => {
    const x = 0.6 + i * 3.1;
    card(s, `Step ${i + 1} card`, x, 1.8, 2.9, 3.6);
    numBadge(s, `Step ${i + 1}`, i + 1, x + 0.25, 2.0);
    para(s, `Step ${i + 1} text`, [{ text: h, options: { bold: true, fontSize: 19, color: C.text2, breakLine: true } }, { text: b, options: { fontSize: 15 } }], x + 0.25, 2.75, 2.45, 2.55);
  });
  card(s, "Pinning callout", 0.6, 5.7, 12.1, 1.0, C.accent2);
  para(s, "Pinning definition", [{ text: "Pinned: ", options: { bold: true } }, { text: "blocking while unable to unmount, so the carrier waits too. Native frames pin on every JDK; synchronized pinned on JDK 21–23." }], 0.85, 5.82, 11.6, 0.8, { fontSize: 17, valign: "middle" });
  s.addNotes("A virtual thread is just a java.lang.Thread whose stack lives on the heap. The JDK runs it on a carrier, which is a normal platform thread from a small ForkJoinPool sized to your cores. The trick is step 3: when you block in a JDK API that supports it, the thread unmounts and the carrier runs someone else. The exception is pinning, and that's what changed across versions.");
}

// ------------------------------------------------------------------ 5 API
{
  const s = slide("Title Only", "Why they exist");
  s.addText("The API is just Thread", { placeholder: "title" });
  code(s, "API code", [
    "// the default choice: one virtual thread per task",
    "try (var exec =",
    "        Executors.newVirtualThreadPerTaskExecutor()) {",
    "    exec.submit(() -> callDownstream());",
    "}   // close() waits for submitted tasks",
    "",
    "Thread.ofVirtual().name(\"worker-\", 0).start(task);",
    "Thread.startVirtualThread(task);",
  ].join("\n"), 0.6, 1.6, 7.4, 3.4, 15);
  code(s, "toString output", "VirtualThread[#23,vt-a]/runnable@ForkJoinPool-1-worker-1", 0.6, 5.3, 7.4, 0.8, 14);
  para(s, "API notes", bullets([
    "No new class to learn. Virtual threads are always daemon threads.",
    "The toString() shows the carrier it's currently mounted on.",
    "Never pool them. Limit the scarce resource with a Semaphore instead (Lab 6: 200 tasks, a downstream that allows 10, peak concurrency exactly 10).",
    "ThreadLocal works but isn't inherited by new threads, and per-thread caches stop paying off.",
  ], 16), 8.4, 1.6, 4.3, 5.0);
  s.addNotes("There's no new thread type. The executor is the default choice, and close() waits for everything you submitted. Thread pools used to do two jobs: reuse expensive threads and cap concurrency. Virtual threads remove the first reason, so don't pool them. The second reason still matters, so put a Semaphore around the scarce resource.");
}

// ------------------------------------------------------------------ 6 pinning by version (section)
{
  const s = slide("Section Dark", "Pinning and JDK versions");
  s.addText("Pinning: the version that matters", { placeholder: "title" });
  s.addText("Same source, three JDKs, one carrier", { placeholder: "body" });
  s.addNotes("This is the main reason the target is Java 25 and not 21.");
}
{
  const s = slide("Title Only", "Pinning and JDK versions");
  s.addText("synchronized pinned on JDK 21 and stopped on 24+", { placeholder: "title" });
  const v21 = msFrom(txt("L4-21.txt")), v25 = msFrom(txt("L4-25.txt")), v27 = msFrom(txt("L4-27.txt"));
  s.addChart(pres.charts.BAR, [{ name: "ms", labels: ["JDK 21", "JDK 25", "JDK 27"], values: [v21, v25, v27] }], Object.assign({
    objectName: "Lab 4 chart", x: 0.6, y: 1.6, w: 6.6, h: 5.0, barDir: "col", chartColors: [HEX.red, HEX.teal, HEX.teal], showValue: true, dataLabelPosition: "outEnd",
    dataLabelFormatCode: "#,##0 \"ms\"", showLegend: false, showTitle: true, title: "Lab 4: 4 tasks × 200 ms sleep in synchronized, 1 carrier", valAxisHidden: true,
  }, AX));
  code(s, "Lab 4 code", "synchronized (lock) {\n    Thread.sleep(200);  // blocking\n}", 7.6, 1.6, 5.1, 1.3, 15);
  para(s, "Pinning notes", bullets([
    "JDK 21: the four sleeps run one after another because each pins the only carrier.",
    "JEP 491 (JDK 24) reworked monitors so a virtual thread can unmount while holding one.",
    "Java 25 is the first LTS with that fix. Native frames (JNI, FFM) still pin everywhere.",
    "On 21, find it with JFR's jdk.VirtualThreadPinned event: 4 events on 21, 0 on 25.",
  ], 15), 7.6, 3.2, 5.1, 3.5);
  s.addNotes(`Lab 4 runs with a single carrier so the effect is easy to see. JDK 21 took ${v21} ms, which is four sleeps in a row, because each one pins the carrier. JDK 25 and 27 took ${v25} and ${v27} ms because the sleeps overlap. Five runs on 21 all landed between 806 and 811 ms. Netflix hit this class of stall in production on 21; it's the main reason to target 25.`);
}
{
  const s = slide("Title Only", "Pinning and JDK versions");
  s.addText("What changed for virtual threads, release by release", { placeholder: "title" });
  const rows = [
    ["21 LTS", "Virtual threads final (JEP 444). synchronized + blocking pins."],
    ["24", "JEP 491: synchronized and Object.wait() no longer pin. -Djdk.tracePinnedThreads removed; use JFR."],
    ["25 LTS", "First LTS with JEP 491. ScopedValue final (JEP 506). Structured concurrency still preview."],
    ["26", "Java servers on Windows can queue more than 200 pending connections (JDK-8330940)."],
    ["27", "Structured concurrency 7th preview: join() throws ExecutionException, not FailedException."],
    ["28 (Mar 2027)", "Structured concurrency final (JEP 543), same API as 27."],
  ];
  rows.forEach(([v, d], i) => {
    const y = 1.6 + i * 0.85;
    const lts = v.includes("LTS");
    card(s, `Release ${v} label card`, 0.6, y, 2.0, 0.7, lts ? C.text2 : C.background2);
    s.addText(v, { objectName: `Release ${v} label`, isTextBox: true, x: 0.6, y, w: 2.0, h: 0.7, fontSize: 18, bold: true, color: lts ? C.background1 : C.text2, align: "center", valign: "middle", margin: 0 });
    para(s, `Release ${v} text`, [{ text: d }], 2.85, y, 9.85, 0.7, { fontSize: 16, valign: "middle" });
  });
  s.addNotes("Two LTS releases matter for us: 21 and 25. Everything that made 21 risky, pinning in synchronized, is fixed in 24 and therefore in 25. Structured concurrency is the one API to wait on: it was re-previewed unchanged in 22 to 24, redesigned in 25, adjusted in 26 and 27, and becomes final in JDK 28 with the JDK 27 API.");
}

// ------------------------------------------------------------------ GET benchmark section
{
  const s = slide("Section Dark", "GET benchmark");
  s.addText("A batch of GET requests, six ways", { placeholder: "title" });
  s.addText("Loop, CompletableFuture and virtual threads, forwarding four headers on every call", { placeholder: "body" });
  s.addNotes("Now the comparison most teams actually need. The site runs eight methods; the next slide charts the six that matter here, and the other two come up on the failures slide and in the header slide.");
}
{
  const s = slide("Title Only", "GET benchmark");
  s.addText("Any concurrency beats the loop; the rest is close", { placeholder: "title" });
  const loop = bench(21, "loop", 200);
  const rows = [["CompletableFuture + sendAsync", "cf-async"], ["CompletableFuture + 64-thread pool", "cf-pool"], ["Virtual threads", "vt"], ["Virtual threads + VT-backed HttpClient", "vt-vtclient"], ["Virtual threads + synchronized wrapper", "vt-sync"]];
  const labels = rows.map(r => r[0]);
  s.addChart(pres.charts.BAR, [
    { name: "JDK 21", labels, values: rows.map(r => bench(21, r[1], 1000).medianMs) },
    { name: "JDK 26", labels, values: rows.map(r => bench(26, r[1], 1000).medianMs) },
  ], Object.assign({
    objectName: "GET benchmark chart", x: 0.6, y: 1.6, w: 8.0, h: 5.1, barDir: "bar", barGrouping: "clustered", chartColors: [HEX.amber, HEX.teal], showValue: true, dataLabelPosition: "outEnd",
    dataLabelFormatCode: "#,##0", showLegend: true, legendPos: "b", legendFontFace: "+mn-lt", legendFontSize: 12, showTitle: true,
    title: "1,000 tasks = 2,000 GETs, median ms (Windows desktop, 16 threads)", valAxisHidden: true, catAxisOrientation: "maxMin", catAxisLabelFontSize: 12,
  }, AX));
  card(s, "Loop stat card", 8.9, 1.6, 3.8, 2.3, C.text2);
  s.addText([{ text: (loop.medianMs / 1000).toFixed(1) + " s", options: { fontSize: 44, bold: true, color: C.accent2, breakLine: true } },
    { text: "for only 400 calls in a plain for loop (JDK 21)", options: { fontSize: 15, color: C.background1 } }],
    { objectName: "Loop stat", isTextBox: true, x: 9.1, y: 1.75, w: 3.4, h: 2.0, valign: "middle", margin: 0 });
  para(s, "Benchmark notes", bullets([
    "Each task: GET /item/i, then a dependent GET /item/i/price; the server waits 20 ms.",
    "Pinning is the version difference: the synchronized wrapper took 3.9 s on 21, 0.44 s on 26.",
    "The 64-thread pool lands where Little's law says: 16 waves × 62 ms.",
  ], 14), 8.9, 4.15, 3.8, 2.6);
  s.addNotes(`Each task makes two dependent GETs against a local server that waits 20 ms. The for loop took ${(loop.medianMs/1000).toFixed(1)} seconds for just 400 calls. Every concurrent style on this chart handled 2,000 calls in about a second or less. The 64-thread pool sits at about a second because Little's law says it must: 16 waves of 62 ms. The exception is the synchronized wrapper on 21, which pinned: ${bench(21,"vt-sync",1000).medianMs} ms versus ${bench(26,"vt-sync",1000).medianMs} on 26. Each task had its own lock there, so that's pinning, not contention. A lock shared by every task would serialize calls on any JDK. One method isn't on the chart because it didn't finish: the common pool, which is the next failures slide. The case for virtual threads isn't raw speed. It's that the code stays a plain loop of blocking calls.`);
}
{
  const s = slide("Title Only", "GET benchmark");
  s.addText("Headers survive a thread hop only if you carry them", { placeholder: "title" });
  const rows = [
    ["for loop · ThreadLocal", bench(26, "loop", 50, "threadlocal")],
    ["CompletableFuture + sendAsync · ThreadLocal", bench(26, "cf-async", 50, "threadlocal")],
    ["CompletableFuture + 64-thread pool · ThreadLocal", bench(26, "cf-pool", 50, "threadlocal")],
    ["Virtual threads · ThreadLocal", bench(26, "vt", 50, "threadlocal")],
    ["StructuredTaskScope forks · ScopedValue", bench(26, "sts", 200, "scoped")],
    ["Plain VT executor · ScopedValue", bench(26, "vt-scoped", 200, "scoped")],
  ];
  const head = [{ text: "How the context is found", options: { bold: true, color: C.background1, fill: { color: C.text2 } } }, { text: "Calls with all 4 headers (JDK 26)", options: { bold: true, color: C.background1, fill: { color: C.text2 }, align: "center" } }];
  const body = rows.map(([l, r]) => {
    const ok = r.forwarded === r.calls;
    return [{ text: l }, { text: `${r.forwarded} / ${r.calls}`, options: { bold: true, align: "center", color: ok ? C.accent4 : C.accent3 } }];
  });
  s.addTable([head, ...body], { objectName: "Forwarding table", x: 0.6, y: 1.6, w: 7.6, colW: [5.2, 2.4], fontSize: 15, color: C.text1, rowH: 0.55, border: { type: "solid", pt: 0.75, color: HEX.grid }, valign: "middle" });
  card(s, "Fix card", 8.6, 1.6, 4.1, 5.0);
  para(s, "Fix text", [
    { text: "What works everywhere", options: { bold: true, fontSize: 19, color: C.text2, breakLine: true } },
    { text: "Read the context once on the request thread, into a local variable, and pass it into every task.", options: { fontSize: 15, breakLine: true } },
    { text: "Every timing run used this and forwarded all four headers on every call.", options: { fontSize: 15, breakLine: true } },
    { text: "sendAsync loses exactly half: the second request is built inside thenCompose, on the client's thread.", options: { fontSize: 15, color: C.text2 } },
  ], 8.85, 1.8, 3.6, 4.7);
  s.addNotes("This is the part that bites in real services. Most code keeps the current request in a ThreadLocal: Spring's RequestContextHolder, MDC, the security context. The moment work moves to another thread, it's gone, and virtual threads are no exception. A new virtual thread starts with empty ThreadLocals. ScopedValue only flows into StructuredTaskScope forks, not into a plain executor. The pattern that works everywhere is explicit capture.");
}
{
  const s = slide("Title Only", "GET benchmark");
  s.addText("Parallel streams don't use virtual threads; mapConcurrent does", { placeholder: "title" });
  const lines = txt("L12-25.txt").split(/\r?\n/).filter(l => / ms /.test(l));
  const row = key => { const l = lines.find(x => x.startsWith(key)); const m = l.match(/(\d+) ms\s+context seen\s+(\d+)\/(\d+)/); return [+m[1], +m[2], +m[3]]; };
  const spec = [["parallelStream · ThreadLocal", "parallelStream, ThreadLocal"], ["mapConcurrent · ThreadLocal", "mapConcurrent(200), ThreadLocal"],
    ["mapConcurrent · InheritableThreadLocal", "mapConcurrent(200), InheritableThreadLocal"], ["mapConcurrent · ScopedValue", "mapConcurrent(200), ScopedValue"],
    ["mapConcurrent · captured variable", "mapConcurrent(200), captured variable"], ["mapConcurrent · withContext() wrapper", "mapConcurrent(200), withContext"]];
  const head = ["Lab 12: 200 × 50 ms calls (JDK 25)", "Time", "Saw context"].map((t, i) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text2 }, align: i ? "center" : "left" } }));
  const body = spec.map(([label, key]) => { const [ms, ok, n] = row(key); return [{ text: label }, { text: ms.toLocaleString("en-US") + " ms", options: { align: "center" } },
    { text: `${ok} / ${n}`, options: { bold: true, align: "center", color: ok === n ? C.accent4 : C.accent3 } }]; });
  s.addTable([head, ...body], { objectName: "mapConcurrent table", x: 0.6, y: 1.6, w: 7.2, colW: [4.2, 1.5, 1.5], fontSize: 14, color: C.text1, rowH: 0.5, border: { type: "solid", pt: 0.75, color: HEX.grid }, valign: "middle" });
  para(s, "mapConcurrent notes", bullets([
    "Parallel streams always run on the common ForkJoinPool: one worker per core, never virtual threads.",
    "The caller thread also takes elements, so the context was lost on exactly half the calls.",
    "Gatherers.mapConcurrent (JDK 24+): one virtual thread per element, a concurrency cap, results in input order.",
  ], 14), 0.6, 5.3, 7.2, 1.5);
  code(s, "mapConcurrent code", [
    "// Java 25: capped fan-out, in order,",
    "// headers carried explicitly",
    "var ctx = ForwardedHeaders.current();",
    "List<Price> prices = ids.stream()",
    "    .gather(Gatherers.mapConcurrent(200,",
    "        id -> client.price(id, ctx)))",
    "    .toList();",
  ].join("\n"), 8.1, 1.6, 4.6, 3.0, 12);
  card(s, "mapConcurrent caveat card", 8.1, 4.85, 4.6, 1.85);
  para(s, "mapConcurrent caveat", [{ text: "Don't rely on inheritance: ", options: { bold: true, color: C.text2 } },
    { text: "InheritableThreadLocal worked here, but MDC and RequestContextHolder aren't inheritable by default. On Java 17, use the executor bean instead." }], 8.3, 5.0, 4.2, 1.6, { fontSize: 14 });
  s.addNotes("A question I expect: can't we just use parallel streams? No. They run on the common ForkJoinPool, one worker per core, and they never use virtual threads. On this 2-core machine the parallel stream took 5 seconds for 200 calls of 50 ms. Worse, the calling thread also processes elements, so the context was there for exactly half the calls, the kind of bug that shows up only sometimes. On Java 25, Gatherers.mapConcurrent is the replacement: each element on its own virtual thread, a concurrency cap, results in order, about 55 ms. Carry the context as a captured variable, or wrap the function so it sets the ThreadLocal on the worker and restores it afterwards.");
}
{
  const s = slide("Title Only", "GET benchmark");
  s.addText("Two failures the benchmark hit before Spring was involved", { placeholder: "title" });
  const items = [
    ["RejectedExecutionException", "runAsync without an executor uses the common pool. At 1,000 blocking tasks it threw \"Thread limit exceeded replacing blocked worker\" on JDK 21 and 26. It allows 256 spare threads, then gives up.", "Always pass an executor to supplyAsync / runAsync."],
    ["HttpClient's own threads", `java.net.http.HttpClient hands work to an internal cached thread pool, even when called from virtual threads: ${bench(26, "vt", 1000).peakPlatformThreads} peak platform threads.`, `give the client a virtual-thread executor: ${bench(26, "vt-vtclient", 1000).peakPlatformThreads} threads, same speed.`],
  ];
  items.forEach(([h, b, fix], i) => {
    const x = 0.6 + i * 6.15;
    card(s, `Failure ${i + 1} card`, x, 1.6, 5.95, 5.0);
    numBadge(s, `Failure ${i + 1}`, i + 1, x + 0.3, 1.85, C.accent3);
    para(s, `Failure ${i + 1} text`, [
      { text: h, options: { bold: true, fontSize: 20, color: C.text2, breakLine: true } },
      { text: b, options: { fontSize: 15, breakLine: true } },
      { text: "Fix: ", options: { bold: true, fontSize: 15, color: C.accent4 } }, { text: fix, options: { fontSize: 15 } },
    ], x + 0.3, 2.6, 5.35, 3.8);
  });
  s.addNotes("Two failures, before Spring was involved. One: CompletableFuture.runAsync with no executor runs on the common pool, and at 1,000 blocking tasks it gave up with RejectedExecutionException. Always pass an executor. Two: java.net.http.HttpClient quietly runs its own cached thread pool even when you call it from virtual threads, so give it a virtual-thread executor. Both of these have field reports behind them, listed in the references. The common-pool failure also shows up in production with blocking Redis calls inside parallel streams. The HttpClient thread count was explained by the JDK networking team on their mailing list: the default executor is a cached thread pool.");
}

// ------------------------------------------------------------------ Spring section
const J17 = "Java 17 + Boot 3.5", J25B4 = "Java 25 + Boot 4.1", J25B3 = "Java 25 + Boot 3.5";
{
  const s = slide("Section Dark", "Spring migration");
  s.addText("Our path: Java 17 + RestTemplate → Java 25 + RestClient", { placeholder: "title" });
  s.addText("Spring executor beans, headers on every call, Boot 3.5 and 4.1", { placeholder: "body" });
  s.addNotes("This section is a real Spring Boot app: a request comes in with four headers, the controller fans out GETs, and every response is checked. It ran on Java 17 with Boot 3.5, Java 25 with Boot 3.5, and Java 25 with Boot 4.1. Later in the migration order, the property spring.threads.virtual.enabled=true comes near the end, after the executor beans are in place.");
}
{
  const s = slide("Title Only", "Spring migration");
  s.addText("Three pieces carry the headers on 17 and 25 alike", { placeholder: "title" });
  const pieces = [
    ["Filter", "Captures the inbound headers once into an immutable value, kept in a ThreadLocal for the request thread."],
    ["TaskDecorator", "One bean, set on every executor. Copies the value onto the worker and restores it in finally."],
    ["Interceptor", "One ClientHttpRequestInterceptor, used by RestTemplate and RestClient alike, adds the headers to every call."],
  ];
  pieces.forEach(([h, b], i) => {
    const y = 1.6 + i * 1.7;
    card(s, `Piece ${i + 1} card`, 0.6, y, 5.6, 1.5);
    numBadge(s, `Piece ${i + 1}`, i + 1, 0.85, y + 0.25);
    para(s, `Piece ${i + 1} text`, [{ text: h, options: { bold: true, fontSize: 18, color: C.text2, breakLine: true } }, { text: b, options: { fontSize: 14 } }], 1.6, y + 0.1, 4.45, 1.35);
  });
  code(s, "Executor beans", [
    "// Java 17: platform pool, sized deliberately",
    "var e = new ThreadPoolTaskExecutor();",
    "e.setCorePoolSize(64); e.setMaxPoolSize(64);",
    "e.setTaskDecorator(forwardHeaders);",
    "",
    "// Java 25: one virtual thread per task",
    "var e = new SimpleAsyncTaskExecutor(\"fanout-\");",
    "e.setVirtualThreads(true);",
    "e.setTaskDecorator(forwardHeaders);",
    "e.setConcurrencyLimit(200);   // not optional",
  ].join("\n"), 6.6, 1.6, 6.1, 4.9, 14);
  s.addNotes(`Without the decorator, headers arrived on 0 of 100 calls, on the pool and on virtual threads, on both machines. With it, every call had all four. Calling code doesn't change between the two executor beans: CompletableFuture.runAsync(task, fanoutExecutor). The concurrency limit on the virtual-thread bean matters; that's the connection-storm slide coming up.`);
}
{
  const s = slide("Title Only", "Spring migration");
  s.addText("The JDK upgrade alone changes nothing; the bean does", { placeholder: "title" });
  const rows = [
    ["Java 17 · 8-thread pool (Boot default shape)", spring(J17, "rt-boot8", 1000).medianMs],
    ["Java 17 · 64-thread pool", spring(J17, "rt-pool", 1000).medianMs],
    ["Java 25 · same 64-thread pool", spring(J25B3, "rt-pool", 1000).medianMs],
    ["Java 25 · virtual-thread bean, limit 200", spring(J25B4, "rc-vt-limit", 1000).medianMs],
  ];
  s.addChart(pres.charts.BAR, [{ name: "ms", labels: rows.map(r => r[0]), values: rows.map(r => r[1]) }], Object.assign({
    objectName: "Spring executor chart", x: 0.6, y: 1.6, w: 8.0, h: 5.1, barDir: "bar", chartColors: [HEX.slate, HEX.slate, HEX.slate, HEX.teal], invertedColors: [HEX.slate],
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "#,##0 \"ms\"", showLegend: false, showTitle: true,
    title: "Spring fan-out, 1,000 tasks = 2,000 GETs (Windows desktop)", valAxisHidden: true, catAxisOrientation: "maxMin", catAxisLabelFontSize: 12,
  }, AX));
  para(s, "Spring executor notes", bullets([
    "Boot's default applicationTaskExecutor has 8 core threads and an unbounded queue: it never grows past 8.",
    "Little's law predicts both pools within 1%: 125 waves and 16 waves × 62 ms.",
    "RestTemplate and RestClient were the same speed on the same request factory, and Boot 3.5 vs 4.1 made no difference.",
  ], 15), 8.9, 1.6, 3.8, 5.1);
  s.addNotes(`Read this top to bottom as a migration. Today, a pool shaped like Boot's default took ${(rows[0][1]/1000).toFixed(1)} seconds; a 64-thread pool took ${rows[1][1]} ms. Upgrading to 25 with the same pool: ${rows[2][1]} ms, no change. Swapping the executor bean to virtual threads with a limit of 200: ${rows[3][1]} ms. RestTemplate to RestClient is not a performance change. We migrate for the API and the deprecation.`);
}
{
  const s = slide("Title Only", "Spring migration");
  s.addText("The trap: RestClient.create() picks a 5-connection pool", { placeholder: "title" });
  const f = ["hc5-default", "simple", "jdk", "hc5-tuned"];
  const names = { "hc5-default": "HttpClient 5, default pool", simple: "HttpURLConnection", jdk: "java.net.http", "hc5-tuned": "HttpClient 5, sized pool" };
  const vals = f.map(x => spring(J25B4, "rc-vt-limit", 1000, "factory", x).medianMs);
  s.addChart(pres.charts.BAR, [{ name: "ms", labels: f.map(x => names[x]), values: vals }], Object.assign({
    objectName: "Request factory chart", x: 0.6, y: 1.6, w: 6.0, h: 5.1, barDir: "bar", chartColors: [HEX.red, HEX.slate, HEX.slate, HEX.teal], showValue: true, dataLabelPosition: "outEnd",
    dataLabelFormatCode: "#,##0 \"ms\"", showLegend: false, showTitle: true, title: "Same RestClient fan-out, only the request factory changed (Java 25, Boot 4.1)",
    valAxisHidden: true, catAxisOrientation: "maxMin", catAxisLabelFontSize: 12,
  }, AX));
  para(s, "Factory notes", bullets([
    "new RestTemplate() uses HttpURLConnection.",
    "RestClient.create() and builder() without a factory pick Apache HttpClient 5 when it's on the classpath, with its defaults: 5 per host, 25 total.",
    "Same on Java 17 with 64 threads: the pool, not the threads, is the cap.",
  ], 15), 6.9, 1.6, 5.8, 2.6);
  code(s, "Factory fix", [
    "var cm = PoolingHttpClientConnectionManagerBuilder",
    "    .create().setMaxConnPerRoute(200)",
    "    .setMaxConnTotal(400).build();",
    "var http = HttpClients.custom()",
    "    .setConnectionManager(cm).build();",
    "RestClient.builder().requestFactory(",
    "    new HttpComponentsClientHttpRequestFactory(http))",
  ].join("\n"), 6.9, 4.35, 5.8, 2.35, 12);
  s.addNotes(`This is the biggest risk in the RestTemplate to RestClient migration. With HttpClient 5 on the classpath, RestClient silently switches to a pool of 5 connections per host. The same 2,000 calls took ${(vals[0]/1000).toFixed(1)} seconds instead of ${vals[3]} ms. That's close to the for loop's time from earlier, but it's a different test: five times as many calls, held back by 5 connections instead of by one thread. A Spring Boot issue and a published write-up report the same thing. Always pass an explicitly configured request factory, and add idle eviction when you size the pool up.`);
}
{
  const s = slide("Title Only", "Spring migration");
  s.addText("Unbounded fan-out caused a connection storm", { placeholder: "title" });
  const probe = txt("storm-probe-desktop.log").replace(/^﻿/, "");
  const parse = t => t.split(/\r?\n/).map(l => l.replace(/\u0000/g, "").trim()).filter(l => l.startsWith("{")).map(JSON.parse);
  let rows25 = [];
  try { rows25 = parse(Buffer.from(fs.readFileSync(path.join(ROOT, "out", "storm-probe-desktop.log"))).toString("utf16le")); } catch (e) { rows25 = []; }
  if (!rows25.length) rows25 = parse(probe);
  let rows26 = [];
  try { rows26 = parse(Buffer.from(fs.readFileSync(path.join(ROOT, "out", "storm-probe-desktop-echo26.log"))).toString("utf16le")); } catch (e) { rows26 = []; }
  if (!rows26.length) rows26 = parse(txt("storm-probe-desktop-echo26.log"));
  const sizes = [300, 500, 1000];
  const cell = r => r ? (r.error ? { text: "refused", options: { bold: true, color: C.accent3, align: "center" } } : { text: "all OK", options: { bold: true, color: C.accent4, align: "center" } }) : { text: "—", options: { align: "center" } };
  const head = [{ text: "Cold start, Java 25 app", options: { bold: true, color: C.background1, fill: { color: C.text2 } } }, ...sizes.map(n => ({ text: `${n} tasks`, options: { bold: true, color: C.background1, fill: { color: C.text2 }, align: "center" } }))];
  const r1 = [{ text: "Server on Temurin 25, no limit" }, ...sizes.map(n => cell(rows25.find(r => r.scenario === "rc-vt" && r.n === n)))];
  const r2 = [{ text: "Server on Temurin 25, limit 200" }, ...sizes.map(n => cell(rows25.find(r => r.scenario === "rc-vt-limit" && r.n === n)))];
  const r3 = [{ text: "Server on JDK 26, no limit" }, ...sizes.map(n => cell(rows26.find(r => r.n === n)))];
  s.addTable([head, r1, r2, r3], { objectName: "Storm table", x: 0.6, y: 1.6, w: 7.6, colW: [3.7, 1.3, 1.3, 1.3], fontSize: 15, color: C.text1, rowH: 0.6, border: { type: "solid", pt: 0.75, color: HEX.grid }, valign: "middle" });
  para(s, "Storm explanation", bullets([
    "A thread pool opens at most 64 connections at once. One virtual thread per task opens them all at the same instant.",
    "Java servers before JDK 26 couldn't queue more than 200 pending connections on Windows (JDK-8330940); Windows refuses the rest.",
    "A loom-dev thread reports the same burst at 8,000 connections on Linux.",
  ], 15), 0.6, 4.3, 7.6, 2.5);
  card(s, "Storm fix card", 8.6, 1.6, 4.1, 5.0, C.text2);
  para(s, "Storm fix", [
    { text: "setConcurrencyLimit(200)", options: { fontFace: "Courier New", bold: true, fontSize: 16, color: C.accent2, breakLine: true } },
    { text: "Beyond the limit a submission waits for a slot instead of opening another connection.", options: { fontSize: 15, color: C.background1, breakLine: true } },
    { text: "Downstream queues, load balancers and gateways aren't ours to tune. Cold starts, deploys and flushed pools all cause bursts. Test from a cold start.", options: { fontSize: 15, color: C.background2 } },
  ], 8.85, 1.85, 3.6, 4.6);
  s.addNotes("This came out of running on my desktop, and the cloud machine never showed it. With no limit, every task asks for a new connection at once, and the server's accept queue overflowed. Moving only the server to JDK 26, which lifts Windows' 200 cap, made the same fan-out succeed up to 2,000 tasks. That confirms the cause, but the lesson holds in production: cap the fan-out at what the downstream can take.");
}
{
  const s = slide("Title Only", "Spring migration");
  s.addText("A migration order that keeps each step measurable", { placeholder: "title" });
  const steps = [
    ["Now, on 17", "Add filter + TaskDecorator + interceptor. Replace the 8-thread default for fan-out. Size the HttpClient 5 pool."],
    ["New code on RestClient", "Available since Boot 3.2. Bridge with RestClient.create(restTemplate), then a builder with an explicit factory."],
    ["Upgrade to 25 alone", "Confirm nothing moved. It shouldn't (995 vs 994 ms)."],
    ["Swap the executor bean", "Virtual-thread SimpleAsyncTaskExecutor, same decorator, concurrency limit, pool sized to match."],
    ["Virtual threads for requests", "Turn on Boot's virtual-thread request handling, then load-test with JFR recording pinning events."],
    ["Boot 4", "Add spring-boot-starter-restclient. RestTemplate is deprecated in Spring 7.0, @Deprecated in 7.1, removal planned for 8.0."],
  ];
  steps.forEach(([h, b], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.6 + col * 4.1, y = 1.6 + row * 2.6;
    card(s, `Migration ${i + 1} card`, x, y, 3.9, 2.4);
    numBadge(s, `Migration ${i + 1}`, i + 1, x + 0.25, y + 0.2);
    para(s, `Migration ${i + 1} text`, [{ text: h, options: { bold: true, fontSize: 18, color: C.text2, breakLine: true } }, { text: b, options: { fontSize: 14 } }], x + 0.95, y + 0.15, 2.8, 2.15);
  });
  s.addNotes("Change one thing at a time so each step can be measured on its own. Steps 1 and 2 pay off on Java 17 today. Step 3 is a pure JDK upgrade and should change nothing. Step 4 is where the speedup comes from. Steps 5 and 6 follow once the first four are stable.");
}

// ------------------------------------------------------------------ close
{
  const s = slide("Title Only", "Wrap-up");
  s.addText("Takeaways", { placeholder: "title" });
  const t = [
    ["Waiting, not computing", "Virtual threads lift the thread ceiling for I/O-bound work. CPU-bound work is unchanged."],
    ["Target Java 25", "JEP 491 removes synchronized pinning. JDK 21 pinning cost us 9× in the benchmark."],
    ["Carry context explicitly", "ThreadLocal never follows a thread hop. TaskDecorator or explicit capture, on every executor."],
    ["Limit at the resource", "No pools of virtual threads. A concurrency limit or Semaphore sized to the downstream."],
    ["Own the request factory", "Never accept HttpClient 5's 5-per-host default. Size it and evict idle connections."],
    ["Measure the cold start", "Bursts from unbounded fan-out show up at startup and deploys, not in warm benchmarks."],
  ];
  t.forEach(([h, b], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 6.15, y = 1.6 + row * 1.7;
    card(s, `Takeaway ${i + 1} card`, x, y, 5.95, 1.5);
    numBadge(s, `Takeaway ${i + 1}`, i + 1, x + 0.25, y + 0.47);
    para(s, `Takeaway ${i + 1} text`, [{ text: h, options: { bold: true, fontSize: 18, color: C.text2, breakLine: true } }, { text: b, options: { fontSize: 14 } }], x + 1.0, y + 0.12, 4.8, 1.3);
  });
  s.addNotes("Six things to take away. If we only do two, it's carrying context explicitly and owning the request factory, because both bite on Java 17 today, before any virtual threads are involved.");
}

// ------------------------------------------------------------------ references
const REFS = [
  ["OpenJDK", [
    ["JEP 444: Virtual Threads", "https://openjdk.org/jeps/444"],
    ["JEP 491: Synchronize Virtual Threads without Pinning", "https://openjdk.org/jeps/491"],
    ["JEP 485: Stream Gatherers (Gatherers.mapConcurrent)", "https://openjdk.org/jeps/485"],
    ["JEP 506: Scoped Values", "https://openjdk.org/jeps/506"],
    ["JEP 525: Structured Concurrency (Sixth Preview)", "https://openjdk.org/jeps/525"],
    ["InfoQ: JEP 533 tightens exception handling in structured concurrency", "https://www.infoq.com/news/2026/05/jep-533-jdk-27/"],
    ["InfoQ: JEP 543 finalizes structured concurrency in JDK 28", "https://www.infoq.com/news/2026/10/jep-543-jdk-28/"],
    ["InfoQ: Virtual Threads After JDK 24", "https://infoq.com/articles/virtual-threads-after-jdk24"],
    ["nio-dev: JDK-8330940, socket backlog greater than 200 on Windows", "https://mail.openjdk.org/pipermail/nio-dev/2025-June/019945.html"],
    ["loom-dev: Virtual vs platform performance at 10K HTTP requests", "https://mail.openjdk.org/pipermail/loom-dev/2025-November/008047.html"],
    ["JDK-8322846: Running with -Djdk.tracePinnedThreads set can hang", "https://bugs.openjdk.org/browse/JDK-8322846"],
    ["net-dev: Reporting issues with HTTP and virtual threads", "https://mail.openjdk.org/pipermail/net-dev/2023-November/022607.html"],
    ["ForkJoinPool API: common pool spare threads", "https://cr.openjdk.org/~iris/se/11/latestSpec/apidiffs/java/util/concurrent/ForkJoinPool-report.html"],
  ]],
  ["Spring and HTTP clients", [
    ["Spring Framework reference: REST Clients", "https://docs.spring.io/spring/reference/7.1/integration/rest-clients.html"],
    ["Spring Boot reference: Task Execution and Scheduling", "https://docs.spring.io/spring-boot/3.4/reference/features/task-execution-and-scheduling.html"],
    ["InfoQ: Spring Boot 3.2 delivers support for virtual threads", "https://www.infoq.com/news/2023/12/spring-boot-virtual-threads/"],
    ["Qiita: RestTemplate → RestClient (Spring 7.0 release notes)", "https://qiita.com/s-ota/items/03c28b3b7e0241741818"],
    ["Why RestTemplate is being retired in Spring Boot 4.2", "https://www.besthub.dev/articles/why-resttemplate-is-being-retired-in-spring-boot-4-2-and-how-to-switch-to-restclient-4b318f8ba616"],
    ["Spring Boot 4 Is Retiring Its HTTP Client — The Swap Slowed Parallel Calls 4x", "https://levelup.gitconnected.com/spring-boot-4-is-retiring-its-http-client-the-swap-slowed-parallel-calls-4x-abc73ffd1787"],
    ["Spring Boot #48479: RestClient advanced configuration", "https://github.com/spring-projects/spring-boot/issues/48479"],
    ["Apache HttpClient 5.6: Connection management", "https://hc.apache.org/httpcomponents-client-5.6.x/connection-management.html"],
    ["Mastering Apache HttpClient 5: a production-grade guide", "https://blog.devgenius.io/mastering-apache-http-client-5-in-java-a-production-grade-guide-4c217e08356d"],
    ["DEV: Fixing lost SecurityContext and correlation IDs in async calls", "https://dev.to/jayesh_shinde/fixing-lost-securitycontext-and-correlation-ids-in-async-calls-with-spring-boot-4pc8"],
    ["@Async deep dive: MDC context loss and TaskDecorator", "https://www.besthub.dev/articles/async-deep-dive-fixing-transaction-loss-mdc-context-loss-and-silent-exception-swallowing-c4d79d89fdbc"],
  ]],
  ["Field reports and background", [
    ["NLJUG: Your Loom App Quietly Became a Thread Pool Again", "https://nljug.org/?p=11467"],
    ["DEV: field guide to virtual thread pinning", "https://dev.to/maschiojv/your-loom-app-quietly-became-a-thread-pool-again-a-field-guide-to-virtual-thread-pinning-2a3f"],
    ["InfoWorld: Java virtual threads hit with pinning issue", "https://www.infoworld.com/article/3713220/java-virtual-threads-hit-with-pinning-issue.html"],
    ["loom-dev: -Djdk.tracePinnedThreads can cause the application to hang", "https://mail.openjdk.org/pipermail/loom-dev/2023-August/006024.html"],
    ["CSDN: Redis \"Thread limit exceeded replacing blocked worker\"", "https://aicoding.csdn.net/6a5e2c7a662f9a54cb91d988.html"],
    ["Choosing between CompletableFuture and ForkJoinPool", "https://www.besthub.dev/articles/choosing-between-completablefuture-and-forkjoinpool-for-high-concurrency-java-applications-93fea170676f"],
    ["Microsoft: listen function (WSAECONNREFUSED on a full backlog)", "https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-listen"],
    ["MongoDB SERVER-31251: small listen backlog under a connection spike", "https://jira.mongodb.com/browse/SERVER-31251"],
    ["GRADLE-3424: NoHttpResponseException after an HttpClient upgrade", "https://issues.gradle.org/browse/GRADLE-3424"],
    ["HappyCoders: Structured Concurrency with StructuredTaskScope", "https://www.happycoders.eu/java/structured-concurrency-structuredtaskscope/"],
    ["inside.java: Alan Bateman's posts (Loom JEP targeting)", "https://inside.java/u/AlanBateman/"],
    ["This talk's site, code and raw results", "https://casper3912.github.io/virtual-threads-measured/"],
  ]],
];
let refNo = 1;
REFS.forEach(([group, list], gi) => {
  const s = slide("Title Only", "References");
  s.addText(`References ${gi + 1}/${REFS.length}: ${group}`, { placeholder: "title" });
  const runs = [];
  list.forEach(([t, u], i) => {
    runs.push({ text: `${refNo++}. `, options: { bold: true, color: C.text2, fontSize: 13 } });
    runs.push({ text: t, options: { hyperlink: { url: u, tooltip: u }, fontSize: 13, color: C.accent1 } });
    runs.push({ text: "  " + new URL(u).hostname.replace(/^www\./, ""), options: { fontSize: 11, color: C.accent5, breakLine: i < list.length - 1 } });
  });
  s.addText(runs, { objectName: `References ${group}`, isTextBox: true, x: 0.6, y: 1.5, w: 12.1, h: 5.3, valign: "top", margin: 0.05, paraSpaceAfter: 4 });
  s.addNotes("Full links are on the site's Sources section. Each title on this slide is a clickable link in the deck.");
});

// ------------------------------------------------------------------ questions
{
  const s = slide("Title Dark", "Wrap-up");
  s.addText("Questions", { placeholder: "title" });
  s.addText([
    { text: "Site, labs and raw results:", options: { breakLine: true } },
    { text: "casper3912.github.io/virtual-threads-measured", options: { hyperlink: { url: "https://casper3912.github.io/virtual-threads-measured/" }, bold: true, color: C.accent2 } },
  ], { placeholder: "body" });
  s.addNotes("The site has everything from this talk: the 13 labs with captured output, the scheduler simulator, the benchmark code you can rerun on your own machine, and a teaching kit with exercises and a quiz. Likely questions, with answers on the site's Q&A section: JDBC and Hikari on 25 don't pin, but the queue moves into Hikari's 10-connection pool, so size it from what the database can take. @Async uses your custom Executor bean once you define one; name it explicitly. Monitor semaphore waits, Hikari pending connections and latency percentiles instead of pool saturation. A blocked virtual thread is about 1 KB of heap. The 17 to 25 upgrade itself is a compatibility job: Security Manager disabled, Unsafe and JNI warnings, and bytecode tools like Lombok, Mockito and JaCoCo need current versions.");
}

(async () => {
  const out = path.join(__dirname, "virtual-threads-measured.pptx");
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log("wrote", out);
})();

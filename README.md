# Virtual Threads, Measured

A single-page course for learning and teaching Java virtual threads. Every number on the page comes from a program in this repo, run on real JDKs, and the page re-checks its own claims in your browser.

**Live page:** https://casper3912.github.io/virtual-threads-measured/

`index.html` is the whole site: one self-contained file with no external requests, so it works when attached to an email or opened from disk.

## What's in it

- **Learning track:** why virtual threads exist (with a Little's law calculator), how mounting and pinning work, the API, when they help, an interactive scheduler simulator, pinning by JDK version (21 → 28), limiting concurrency, `ScopedValue`, parallel streams vs `Gatherers.mapConcurrent`, structured concurrency, and observability with JFR and JSON thread dumps.
- **12 labs**, each with its source and the output captured on JDK 21, 25 and 27.
- **GET-request benchmark:** a for loop vs `CompletableFuture` (sendAsync, fixed pool, common pool) vs virtual threads vs `StructuredTaskScope` + `ScopedValue`. Every call forwards `X-Request-Id`, `X-Tenant-Id`, `Authorization` and `traceparent`, and every response is checked.
- **Spring section:** executor beans, `TaskDecorator` + interceptor header forwarding, RestTemplate → RestClient, Java 17 → 25, Boot 3.5 vs 4.1, and request factories. It includes the HttpClient 5 default-pool trap and connection storms from unbounded virtual-thread fan-out.
- **Field reports:** each failure the benchmarks hit, linked to OpenJDK, Spring and library discussions of the same problem.
- **Slides tab:** the 24-slide talk (November 11, 2026) with speaker notes, a keyboard-driven viewer, and the PowerPoint embedded for download. Its charts are built from the same `out/` results as the page.
- **Teaching kit:** a three-session plan, misconceptions, graded exercises, a review checklist, ArchUnit guardrails and a quiz.

Measurements come from a 2-vCPU Linux cloud machine (OpenJDK 21.0.12, Temurin 17.0.21 / 25.0.5 / 27.0.1) and a Windows 11 desktop (Intel i7-1260P, 16 threads; Temurin 17.0.20.1 / 21.0.11 / 25.0.5, OpenJDK 26).

## Layout

| Path | What |
|---|---|
| `index.html` | The built page (committed; CI rebuilds it and requires an exact match) |
| `src/` | Page template and section sources; `src/build-date.txt` is the date shown in the colophon |
| `build.py` | Inlines lab sources, captured outputs and benchmark results into `index.html`; refuses to build if any result is missing |
| `slides/` | The talk: `virtual-threads-measured.pptx`, its generator `build_deck.js` (pptxgenjs), `render.py` (slide images + speaker notes for the Slides tab), `img/` and `notes.json` |
| `labs/` | The 12 lab programs (`java L4Pinning.java`; L8 needs `--enable-preview --source <N>`) |
| `guard/` | ArchUnit guardrail rules and the sample package they were tested on |
| `bench/` | Plain-JDK GET benchmark: echo server, benchmark, ScopedValue variant, `run_bench.py` driver |
| `spring/` | Spring Boot fan-out app (Maven profiles `boot3` = Boot 3.5, `boot4` = Boot 4.1), `run_spring_bench.py`, `storm_probe.py` |
| `out/` | Every captured output and benchmark result the page is built from |
| `verify/verify.js` | Opens the page in Chromium and fails on any failing self-test, page error, external request or sideways scroll |

## Rebuild and verify

    python3 build.py          # writes index.html from src/ + labs/ + out/
    npm install && npx playwright install chromium
    node verify/verify.js     # the same check CI runs

## Rebuild the slides

    node slides/build_deck.js                 # writes slides/virtual-threads-measured.pptx from out/
    python3 slides/render.py [deck.pdf]       # slide images + notes for the Slides tab (needs LibreOffice, or pass a PDF export)
    python3 build.py

## Re-measure on your own hardware

    # plain-JDK GET benchmark (about 5 minutes)
    python3 bench/run_bench.py --jdk 21=<jdk21 home> --jdk 25=<jdk25 home> --out out/bench-desktop.jsonl

    # Spring benchmark: build both jars, then run (about 13 minutes)
    cd spring && mvn -Pboot3 clean package && mkdir -p dist && cp target/fanout-boot3.jar dist/
    mvn -Pboot4 clean package && cp target/fanout-boot4.jar dist/ && cd ..
    python3 spring/run_spring_bench.py --machine desktop --out out/spring-bench-desktop.jsonl \
      --config "Java 17 + Boot 3.5=<jdk17 home>=spring/dist/fanout-boot3.jar" \
      --config "Java 25 + Boot 3.5=<jdk25 home>=spring/dist/fanout-boot3.jar" \
      --config "Java 25 + Boot 4.1=<jdk25 home>=spring/dist/fanout-boot4.jar"

    # cold-start connection-storm probe (set ECHO_JAVA_HOME to run the downstream on another JDK)
    python3 spring/storm_probe.py <jdk25 home> spring/dist/fanout-boot4.jar 100 150 200 300 500 1000 > out/storm-probe-desktop.log

Then run `python3 build.py`, update `src/build-date.txt`, and commit `index.html` together with the new `out/` files. The config labels must stay exactly as written, because the page keys its tables on them.

## CI and publishing

`.github/workflows/publish.yml` runs on every push to `main`. It rebuilds `index.html` and diffs it against the commit, runs `verify/verify.js` in Chromium, then deploys the page to GitHub Pages. Pull requests run the same checks without deploying.

## License

MIT

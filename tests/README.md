# Regression tests (not part of the app)

Each file replays one way the app could lose a photo, a note or a sheet row, in a real headless Chromium with a fake camera and a fake backend/sheet (`h.js`). Nothing here touches the real sheet, Drive or Claude.

- `t00_smoke.js` — the app loads and three shots land in one box.
- `g1_*` … `g6_*` — the 32 audit findings fixed in intake-v38 (photos into boxes, Drive saves, the day changing, sheet rows, notes and watch list, backend v10).
- `r_*` — the 31 findings of the review of that release.

Run them all with `tests/run-all.sh` (Node + `npm i playwright` with Chromium). Each prints `PASS name`, or `FAIL name …` and exits 1. `REPO=/other/copy node tests/x.js` runs one test against another copy of the app.

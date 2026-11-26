// R11: + Camera on a finished card while its read is still running, and Close tapped while the camera still says
// "Starting camera…" (the phone's camera answers 1.2 s after it is asked, as opening a 4K rear camera often does). The
// camera that answers after the Close must be stopped at once and the card must go into the sheet by itself when its
// read ends (v38 kept the late camera running behind the closed screen, so the card counted as still being shot: never
// sent by itself, left out of "Send N to sheet"). Then a Close tapped while the camera sets itself up (its photo
// settings take 1 s): no screen wake lock may be taken for a camera that is already closed.
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'r_R11_late_stream';
const PORT = +process.env.PORT || 10410;
(async () => {
  const ctl = {};
  let release; const hold = new Promise(r => { release = r; });
  ctl.hook = async kind => { if (kind === 'label' && !ctl.free) await hold; };   // box #1's read waits until released
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: L.makeBackend(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    await t.page.evaluate(() => {
      window.__wl = 0; window.__wlLive = 0;            // screen wake locks asked for / still held
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wl++; window.__wlLive++; let on = true; return { release: async () => { if (on) { on = false; window.__wlLive--; } } }; } } });
    });
    await L.phonePhoto(t, 'L1'); await L.phonePhoto(t, 'A');
    await L.waitFor(t, '!S.sortP.size');
    const id = await t.ev('S.current'), q = JSON.stringify(id);
    await t.page.click('#curFinish');
    await L.waitFor(t, `S.active.has(${q})`, 10000);
    await t.page.evaluate(() => {
      const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.__streams = [];
      navigator.mediaDevices.getUserMedia = c => new Promise(r => setTimeout(r, window.__gumDelay || 0)).then(() => g(c)).then(s => { window.__streams.push(s); return s; });
      window.__gumDelay = 1200;
    });
    await t.page.click(`[data-id="${id}"] [data-act="toggle"]`).catch(() => {});
    await t.page.click(`[data-id="${id}"] [data-act="cam"]`);
    await t.page.waitForTimeout(300);
    if (!/Starting camera/.test(await t.page.textContent('#camMsg'))) throw new Error('setup: the camera had already started');
    await t.page.click('#camClose');                   // changed their mind while "Starting camera…"
    await L.waitFor(t, 'document.querySelector("#cam").hidden', 5000);
    await t.page.waitForTimeout(2000);                 // the camera answers after the Close
    const late = JSON.parse(await t.ev(`JSON.stringify({ asked: window.__streams.length, live: window.__streams.some(s => s.getTracks().some(x => x.readyState === 'live')), stream: !!CAM.stream, wl: window.__wlLive })`));
    if (late.asked !== 1) throw new Error('setup: the late camera never answered');
    if (late.live || late.stream) fail('the camera that answered after Close is still running');
    if (late.wl) fail('a screen wake lock is held for the closed camera');
    ctl.free = true; release();                        // the card's read ends now
    await L.waitIdle(t, 20000); await t.page.waitForTimeout(1500); await L.waitIdle(t, 20000);
    const st = JSON.parse(await t.ev(`JSON.stringify({ view: viewStatus(S.boxes.get(${q})), row: S.boxes.get(${q}).sheetRow, bar: document.querySelector('#sendBtn').textContent })`));
    if (!st.row || ctl.sheet.rows.length !== 1) fail(`card not sent by itself after its read: ${JSON.stringify(st)}, ${ctl.sheet.rows.length} rows`);
    // Close while the camera sets itself up (getPhotoCapabilities takes 1 s): no wake lock for it
    await t.page.evaluate(() => {
      window.__gumDelay = 0;
      const gp = ImageCapture.prototype.getPhotoCapabilities;
      ImageCapture.prototype.getPhotoCapabilities = function () { return new Promise(r => setTimeout(r, 1000)).then(() => gp.call(this)); };
    });
    const wl0 = await t.ev('window.__wl');
    await t.page.click(`[data-id="${id}"] [data-act="cam"]`);
    await L.waitFor(t, 'window.__streams.length === 2 && !!CAM.stream', 5000);
    await t.page.waitForTimeout(200);
    await t.page.click('#camClose');
    await L.waitFor(t, 'document.querySelector("#cam").hidden', 5000);
    await t.page.waitForTimeout(1800);
    const after = JSON.parse(await t.ev(`JSON.stringify({ wl: window.__wl, live: window.__wlLive, stream: !!CAM.stream, tracks: window.__streams[1].getTracks().map(x => x.readyState) })`));
    if (after.wl !== wl0 || after.live) fail(`Close while the camera was setting up: ${after.wl - wl0} wake lock(s) asked for, ${after.live} held`);
    if (after.stream || after.tracks.includes('live')) fail('camera still running after Close: ' + JSON.stringify(after));
    // a normal opening still takes its wake lock and releases it at Close
    await t.page.click(`[data-id="${id}"] [data-act="cam"]`);
    await L.waitFor(t, 'CAM.stream && document.querySelector("#camMsg").hidden && window.__wlLive === 1', 8000).catch(() => fail('a normal camera opening took no wake lock'));
    await t.page.click('#camClose');
    await L.waitFor(t, 'document.querySelector("#cam").hidden && window.__wlLive === 0', 5000).catch(() => fail('wake lock not released at Close'));
    if (t.errs.filter(e => !/Failed to load resource/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { release(); await t.close(); }
  L.report(NAME, ok, why);
})();

// R23: a QUICK CAM tap asks the camera for its still first, and only then copies the preview (the copy, for a still
// that is late, takes ~50 ms of the phone's time at a 4K preview; v38 made it before asking for the still, so every
// still started that much later). The copy is still made in the same tap (so it is that tap's frame), every copy is
// closed, and the photos are the camera's stills. A copy that can't be made never loses the shot: with full-quality
// stills off, the photo is the preview as it is then.
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'r_R23_still_first';
const PORT = +process.env.PORT || 10460;
(async () => {
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: L.makeBackend({}) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(600);
    await t.page.click('#camBtn');
    await L.waitFor(t, 'CAM.stream && document.querySelector("#video").videoWidth > 0 && document.querySelector("#camMsg").hidden', 15000);
    await t.page.waitForTimeout(300);
    if (!(await t.ev('S.sharp && !!CAM.ic'))) throw new Error('setup: no full-quality stills');
    await t.page.evaluate(() => {
      window.__log = []; window.__live = 0;
      ImageCapture.prototype.takePhoto = function () {
        window.__log.push('still');
        return new Promise(r => setTimeout(r, 300)).then(() => {
          const c = document.createElement('canvas'); c.width = 2000; c.height = 1500; c.getContext('2d').fillRect(0, 0, 2000, 1500);
          return new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
        });
      };
      const cib = window.createImageBitmap;
      window.createImageBitmap = function (src, ...a) {
        if (window.__cibThrows && src instanceof HTMLVideoElement) throw new DOMException('no frame (test)', 'InvalidStateError');
        if (src instanceof HTMLVideoElement) window.__log.push('copy');
        return cib.call(this, src, ...a).then(bm => { if (src instanceof HTMLVideoElement) { window.__live++; const cl = bm.close.bind(bm); bm.close = () => { if (!bm.__c) { bm.__c = 1; window.__live--; } cl(); }; } return bm; });
      };
    });
    // one tap: what runs in the tap itself, and in what order
    const r = await t.page.evaluate(async () => {
      window.__log.length = 0;
      document.querySelector('#shutter').click();
      const inHandler = window.__log.slice();
      await new Promise(res => setTimeout(res, 0));    // the next task: whatever this tap does in its own task is done
      return { inHandler, inTap: window.__log.slice() };
    });
    if (r.inHandler.length) fail('made in the tap handler itself, before the still was asked for: ' + JSON.stringify(r.inHandler));
    if (JSON.stringify(r.inTap) !== '["still","copy"]') fail('in the tap: ' + JSON.stringify(r.inTap) + ' (expected the still asked for first, then the copy, both in the tap)');
    // three real taps, each once the camera is free (a tap while a still is still coming: its own still waits for the
    // camera, so its copy is made first — still in the tap)
    for (let i = 0; i < 3; i++) {
      await L.waitFor(t, `S.photos.size === ${i + 1}`, 10000);
      await t.page.evaluate(() => { window.__log.length = 0; });
      await t.page.click('#shutter');
      await t.page.waitForTimeout(500);
      const lg = await t.ev('JSON.stringify(window.__log)');
      if (lg !== '["still","copy"]') fail(`tap ${i + 2}: ${lg}`);
    }
    await L.waitFor(t, 'S.photos.size === 4', 15000);
    await t.ev('CAM.queue'); await t.page.waitForTimeout(500);
    const sizes = await t.ev('JSON.stringify([...S.photos.values()].map(p => p.w + "x" + p.h))');
    if (JSON.stringify(JSON.parse(sizes)) !== JSON.stringify(['2000x1500', '2000x1500', '2000x1500', '2000x1500'])) fail('photos ' + sizes + ' (expected the camera\'s stills)');
    const live = await t.ev('window.__live');
    if (live) fail(`${live} preview copies left open`);
    // full-quality stills off, and the copy can't be made: the shot is still saved (the preview as it is)
    await t.ev('(S.sharp = false, window.__cibThrows = true, 1)');
    await t.page.click('#shutter'); await t.page.waitForTimeout(400); await t.page.click('#shutter');
    await L.waitFor(t, 'S.photos.size === 6', 10000).catch(() => {});
    const n = await t.ev('S.photos.size'), count = await t.page.textContent('#camCount');
    if (n !== 6 || count !== '6') fail(`with no copy: ${n - 4} of 2 shots saved, the camera counts ${count}`);
    await t.ev('(S.sharp = true, window.__cibThrows = false, 1)');
    await t.page.click('#camDone');
    await L.waitFor(t, 'document.querySelector("#cam").hidden', 10000);
    if (t.errs.filter(e => !/Failed to load resource/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

// F6: QUICK CAM never drops a shot silently.
//  a) a tap while the camera has no picture yet is not a photo: no flash, no buzz, no count;
//  b) phone storage full (Chromium's real quota limit): the camera says the photo was NOT saved, with an error buzz,
//     and the main screen says it again when the camera closes (v37: the count went back down, nothing was said).
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'g1_quickcam_loss';
(async () => {
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: L.makeBackend({}) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    await t.page.evaluate(() => { window.__vib = []; navigator.vibrate = p => { window.__vib.push(p); return true; }; });
    await t.page.click('#camBtn');
    await L.waitFor(t, 'CAM.stream && document.querySelector("#video").videoWidth > 0', 10000);

    // a) no picture yet (as right after the camera starts): the tap does nothing
    await t.ev('document.querySelector("#video").srcObject = null, 1');
    await t.page.click('#shutter');
    await t.page.waitForTimeout(400);
    const vibA = await t.page.evaluate(() => window.__vib.length), nA = await t.ev('CAM.n');
    if (vibA || nA) fail(`a tap with no picture counted as a photo (buzz ${vibA}, count ${nA})`);
    await t.ev('document.querySelector("#video").srcObject = CAM.stream, 1');
    await L.waitFor(t, 'document.querySelector("#video").videoWidth > 0', 10000);

    // b) storage full: IndexedDB refuses every photo record the way a full phone does (QuotaExceededError); a small
    //    box record still fits. (Chromium's quota override is not applied reliably enough for a test.)
    await t.page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (v, ...a) { if (v && v.blob) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return put.call(this, v, ...a); };
    });
    const n0 = await t.ev('CAM.n');
    await t.page.click('#shutter');
    await L.waitFor(t, `CAM.n === ${n0} && document.querySelector("#camStrip").children.length === ${n0}`, 10000);
    await t.page.waitForTimeout(300);
    const msg = await t.ev('document.querySelector("#camMsg").hidden ? "" : document.querySelector("#camMsg").textContent');
    if (!/NOT saved/.test(msg) || !/storage is full/i.test(msg)) fail('camera said nothing useful: ' + JSON.stringify(msg));
    const buzz = await t.page.evaluate(() => window.__vib);
    if (!buzz.some(p => Array.isArray(p))) fail('no error buzz: ' + JSON.stringify(buzz));
    await t.page.click('#camDone');
    await L.waitFor(t, 'document.querySelector("#cam").hidden', 10000);
    await t.page.waitForTimeout(300);
    const note = await t.page.textContent('#notice'), shown = await t.ev('!document.querySelector("#notice").hidden');
    if (!shown || !/NOT saved/.test(note)) fail('no notice after the camera closed: ' + JSON.stringify(shown && note));
    const errs = t.errs.filter(e => !/QuotaExceeded|quota/i.test(e));
    if (errs.length) fail('page errors ' + JSON.stringify(errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

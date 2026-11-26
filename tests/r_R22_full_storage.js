// R22: the phone's storage is full.
//  1) Nothing can be saved: QUICK CAM 3 shots, NEXT BOX, 2 shots, DONE; then 2 photos from the gallery. Every photo is
//     said to be NOT saved, and no box is made (v38 left an empty "Box #N" card per shot and used up the numbers).
//  2) Box records still fit, photos don't: QUICK CAM 2 shots, NEXT BOX, 2 shots, DONE. One empty box stays in
//     progress (v38 left an empty card behind at each NEXT BOX).
//  3) Space freed: QUICK CAM 2 shots, DONE. The photos go into that box, #1: it is the only box of the day.
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'r_R22_full_storage';
const PORT = +process.env.PORT || 10450;
(async () => {
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: L.makeBackend({}) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const st = () => t.ev(`JSON.stringify({ boxes: allBoxes().sort((a, b) => a.seq - b.seq).map(b => [b.seq, b.photos.length]), cur: S.current && (S.boxes.get(S.current) || {}).seq,
    cards: document.querySelectorAll('#boxes [data-id]').length, notice: document.querySelector('#notice').hidden ? '' : document.querySelector('#notice').textContent })`).then(JSON.parse);
  const db = () => t.ev('allBoxesDb().then(l => JSON.stringify(l.map(b => [b.seq, b.photos.length]).sort()))').then(JSON.parse);
  const quick = async (a, b) => {
    await t.page.click('#camBtn');
    await L.waitFor(t, 'CAM.stream && document.querySelector("#video").videoWidth > 0 && document.querySelector("#camMsg").hidden', 10000);
    for (let i = 0; i < a; i++) { await t.page.click('#shutter'); await t.page.waitForTimeout(700); }
    if (b) { await t.page.click('#newBoxBtn'); await t.page.waitForTimeout(800); for (let i = 0; i < b; i++) { await t.page.click('#shutter'); await t.page.waitForTimeout(700); } }
    await t.page.click('#camDone');
    await L.waitFor(t, 'document.querySelector("#cam").hidden', 10000);
    await L.waitFor(t, '!(S.saving > 0) && !(S.ending > 0)', 10000);
    await t.page.waitForTimeout(800);
  };
  try {
    await t.page.waitForTimeout(500);
    await t.page.evaluate(() => {       // window.__full: every write fails; window.__photosFull: photo writes fail
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (v, ...a) {
        if (window.__full || (window.__photosFull && this.name === 'photos')) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        return put.call(this, v, ...a);
      };
    });
    // 1) nothing fits
    await t.page.evaluate(() => { window.__full = true; });
    await quick(3, 2);
    let s = await st();
    if (s.boxes.length || s.cards) fail('1) nothing saved, yet boxes ' + JSON.stringify(s.boxes) + `, ${s.cards} cards`);
    if (!/Phone storage is full — 5 camera photos were NOT saved/.test(s.notice)) fail('1) notice ' + JSON.stringify(s.notice));
    await L.galleryPhotos(t, ['L1', 'A']);
    await L.waitFor(t, '!(S.saving > 0)', 15000); await t.page.waitForTimeout(800);
    s = await st();
    if (s.boxes.length || s.cards) fail('1) gallery: boxes ' + JSON.stringify(s.boxes) + `, ${s.cards} cards`);
    if (!/NOT saved/.test(s.notice)) fail('1) gallery notice ' + JSON.stringify(s.notice));
    // 2) box records fit, photos don't
    await t.page.evaluate(() => { window.__full = false; window.__photosFull = true; });
    await quick(2, 2);
    s = await st();
    if (JSON.stringify(s.boxes) !== '[[1,0]]' || s.cur !== 1) fail('2) photos not saved: boxes ' + JSON.stringify(s.boxes) + ', in progress #' + s.cur);
    if (!/4 camera photos were NOT saved/.test(s.notice)) fail('2) notice ' + JSON.stringify(s.notice));
    // 3) space freed
    await t.page.evaluate(() => { window.__photosFull = false; });
    await quick(2, 0);
    await L.waitIdle(t);
    s = await st();
    if (JSON.stringify(s.boxes) !== '[[1,2]]') fail('3) after space was freed: boxes ' + JSON.stringify(s.boxes));
    const d = await db();
    if (JSON.stringify(d) !== '[[1,2]]') fail('3) saved on the phone: ' + JSON.stringify(d));
    if (t.errs.filter(e => !/Failed to load resource/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

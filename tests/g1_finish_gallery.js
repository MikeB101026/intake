// F8 + F4 (gallery): photos picked with PHOTOS for the box in progress, and "Finish this box" tapped while they are
// still saving. They must all land in THAT box and its row (v37: the box went to the sheet with only its label and
// the photos started a new box), and photos being imported never show as "waiting to be sorted".
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'g1_finish_gallery';
(async () => {
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: L.makeBackend(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    await L.slowSaves(t);
    await L.phonePhoto(t, 'L2');
    await L.waitFor(t, '!S.sortP.size');
    await L.setSlow(t, 700);                           // each gallery photo takes 0.7 s to save
    await L.galleryPhotos(t, ['C', 'D', 'E']);
    await t.page.click('#curFinish');                  // Finish tapped while "Saving 3 photos…" shows
    await L.waitFor(t, 'S.photos.size >= 2', 10000);   // the first gallery photo is saved, the others are still coming
    const pend = await t.ev('render(), document.querySelector("#pending").hidden ? "" : document.querySelector("#pendCount").textContent');
    if (pend) fail('photos being imported showed as pending: ' + pend);
    await L.setSlow(t, 0);
    await L.waitFor(t, 'S.photos.size >= 4', 15000);
    await L.waitIdle(t);
    const bx = await L.boxes(t), row = ctl.sheet.rows.find(r => r.cells[0] === 'MARY JONES');
    if (bx.length !== 1) fail('expected 1 box, got ' + JSON.stringify(bx.map(b => [b.seq, b.n, b.customer, b.contents])));
    if (!bx[0] || bx[0].n !== 4) fail('box 1 photos ' + JSON.stringify(bx[0] && bx[0].n));
    if (!row) fail('row not sent');
    else for (const it of ['CHARLIE LAMP', 'DELTA MUG', 'ECHO FAN']) if (!row.cells[6].includes(it)) fail(`row contents missing ${it}: ${JSON.stringify(row.cells[6])}`);
    const pendNow = await t.ev('pendingPhotos().length');
    if (pendNow) fail(pendNow + ' photos waiting to be sorted at the end');
    if (t.errs.length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

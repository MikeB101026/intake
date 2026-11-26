// F1: "Finish this box" tapped while the last PHONE CAMERA photo is still saving. The photo must land in that box, be in
// its read and in the row that goes to the sheet (v37: the read started without it and the box was auto-sent without it).
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'g1_finish_phone';
(async () => {
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: L.makeBackend(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    await L.slowSaves(t);
    await L.phonePhoto(t, 'L1'); await L.phonePhoto(t, 'A');
    await L.waitFor(t, '!S.sortP.size');
    await L.setSlow(t, 1500);                          // the last photo takes 1.5 s to save
    await L.phonePhoto(t, 'B', false);
    await t.page.click('#curFinish');                  // tapped straight away, while "Saving photo…" shows
    const btn = await t.page.textContent('#curFinish');
    await L.setSlow(t, 0);
    await L.waitFor(t, 'S.photos.size >= 3', 15000);
    await L.waitIdle(t);
    const bx = await L.boxes(t), row = ctl.sheet.rows.find(r => r.cells[0] === 'JOHN SMITH');
    if (bx.length !== 1) fail('expected 1 box, got ' + JSON.stringify(bx.map(b => [b.seq, b.n])));
    if (!bx[0] || bx[0].n !== 3 || bx[0].exist !== 3) fail('box 1 photos ' + JSON.stringify(bx[0] && [bx[0].n, bx[0].exist]));
    if (!row) fail('row not sent: ' + JSON.stringify(bx.map(b => [b.seq, b.view, b.reasons])));
    else if (!/BRAVO SOCK/.test(row.cells[6]) || !/ALPHA SHOE/.test(row.cells[6])) fail('row contents missing an item: ' + JSON.stringify(row.cells[6]));
    const up = ctl.uploads.find(u => row && u.row === row.row);
    if (row && (!up || !up.who.includes('B'))) fail('photo B not uploaded: ' + JSON.stringify(ctl.uploads));
    if (process.env.REPO == null && !/Finishing|Saving/.test(btn)) fail('Finish button did not show the wait: ' + btn);
    if (t.errs.length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

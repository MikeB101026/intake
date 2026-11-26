// F1: "+ Camera" on a card that is still being read. The box must not be sent while the camera is open on it, and
// after Close the new shot is read and goes into the row (v37: the read finished without it, auto-send wrote the row
// while the camera was still open, and Close never read the box again).
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'g1_cam_reading_card';
(async () => {
  let release; const hold = new Promise(r => { release = r; });
  const ctl = { hook: async kind => { if (kind === 'label') await hold; } };   // box 1's label read waits until released
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: L.makeBackend(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    await L.phonePhoto(t, 'L1'); await L.phonePhoto(t, 'A');
    await L.waitFor(t, '!S.sortP.size');
    const id = await t.ev('S.current');
    await t.page.click('#curFinish');
    await L.waitFor(t, `S.active.has(${JSON.stringify(id)})`, 10000);   // box 1 is being read
    await t.page.click(`[data-id="${id}"] [data-act="toggle"]`);
    await t.page.click(`[data-id="${id}"] [data-act="cam"]`);
    await L.waitFor(t, 'CAM.stream && document.querySelector("#video").videoWidth > 0', 10000);
    await t.page.click('#shutter');
    await L.waitFor(t, `S.boxes.get(${JSON.stringify(id)}).photos.length === 3`, 10000);
    release();                                         // the read finishes while the camera is still open on the card
    await t.page.waitForTimeout(1500);
    if (ctl.sheet.rows.length) fail('the box was sent while the camera was open on it: ' + JSON.stringify(ctl.sheet.rows.map(r => r.cells[6])));
    await t.page.click('#camClose');
    await L.waitFor(t, 'document.querySelector("#cam").hidden', 10000);
    await L.waitIdle(t);
    const bx = await L.boxes(t), row = ctl.sheet.rows.find(r => r.cells[0] === 'JOHN SMITH');
    if (bx.length !== 1 || bx[0].n !== 3) fail('boxes ' + JSON.stringify(bx.map(b => [b.seq, b.n])));
    if (!row) fail('row not sent: ' + JSON.stringify(bx.map(b => [b.view, b.reasons])));
    else if (!/CAMERA ITEM/.test(row.cells[6]) || !/ALPHA SHOE/.test(row.cells[6])) fail('row contents ' + JSON.stringify(row.cells[6]));
    const up = row && ctl.uploads.filter(u => u.row === row.row).pop();
    if (row && (!up || up.who.length !== 3)) fail('uploads ' + JSON.stringify(ctl.uploads));
    if (t.errs.length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { release(); await t.close(); }
  L.report(NAME, ok, why);
})();

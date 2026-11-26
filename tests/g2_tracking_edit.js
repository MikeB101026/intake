// F26: (1) the tracking is corrected on the card while the box's photo save is waiting to try again: the save must still
// be checked against the tracking the sheet holds (v37 sent the new one, every try was refused: "no longer holds this
// box"). (2) "Update sheet row" on a box whose photos didn't save sends them right after (v37 never queued them).
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'g2_tracking_edit';
(async () => {
  let edited; const editDone = new Promise(r => { edited = r; });
  // the first try is on its way while the tracking is corrected, and is lost: the next one goes after the correction
  const ctl = { photosHook: async (body, n) => { if (n === 1) { await editDone; return 'ABORT'; } } };
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: G.makeBackend2(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    await L.phonePhoto(t, 'L1'); await L.phonePhoto(t, 'A');
    await L.waitFor(t, '!S.sortP.size');
    const id = await t.ev('S.current'), q = JSON.stringify(id);
    await t.page.click('#curFinish');
    await L.waitFor(t, `!!S.boxes.get(${q}).sheetRow`, 20000);
    await new Promise(r => { const w = () => ctl.photoCalls >= 1 ? r() : setTimeout(w, 20); w(); });   // the first try is on its way
    await G.expand(t, id);
    const sel = `[id="tr-${id}"]`;
    await t.page.fill(sel, 'TBA111111111199'); await t.page.press(sel, 'Tab');   // the operator corrects the tracking
    await L.waitFor(t, `S.boxes.get(${q}).row.tracking === 'TBA111111111199'`, 5000);
    edited();
    const saved = await L.waitFor(t, `S.boxes.get(${q}).photosLinked`, 10000).then(() => true, () => false);
    const up = ctl.uploads[0];
    if (!saved || !up || up.expect !== 'TBA111111111111') fail('save checked against ' + JSON.stringify(up && up.expect) + ', refused: ' + JSON.stringify(ctl.rejects));
    if (saved) await G.idle(t);
    // (2) a box whose photos didn't save, with a change to send: Update sends the row, then the photos
    const b = G.sentBox({ id: 'upd', seq: 2, sheetRow: 300, photos: ['u1', 'u2'], linkError: 'Sheet row 300 no longer holds this box.', linkErrAt: Date.now(),
      row: { customer: 'MARY JONES', tracking: 'TBA222222222222', weight: '7' } });
    await G.inject(t, [{ id: 'u1', shape: 'L2', kind: 'label', box: 'upd' }, { id: 'u2', shape: 'B', kind: 'item', box: 'upd' }], [b]);
    ctl.sheet.rows.push(G.sheetRowFor(b, 300));
    ctl.offline = ['photos'];
    await G.reload(t);
    await L.waitFor(t, 'S.boxes.get("upd")', 10000); await t.page.waitForTimeout(1000); await G.idle(t);
    ctl.offline = false;
    await t.ev('patchBox("upd", x => { x.row.weight = "8"; x.edited.weight = true; }).then(() => 1)');   // a change made on the card
    await G.expand(t, 'upd');
    await t.page.click('[data-id="upd"] [data-act="upd"]');
    await L.waitFor(t, 'S.boxes.get("upd").photosLinked', 8000).catch(() => {});
    const u2 = ctl.uploads.filter(u => u.row === 300).pop(), row = ctl.sheet.rows.find(r => r.row === 300);
    if (!u2 || u2.n !== 2 || row.cells[3] !== '8') fail('after Update ' + JSON.stringify({ u2, cells: row.cells }));
    if (t.errs.filter(e => !/Failed to load resource|ERR_FAILED/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { edited(); await t.close(); }
  L.report(NAME, ok, why);
})();

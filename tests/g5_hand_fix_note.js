// F25 (note): the contents were fixed by hand (+ on a line), then a note was typed on the card. The read with the note
// can't change hand-fixed contents, so the box says the note changed after the fix and waits on Check — before, the
// note's items were dropped and the box went into the sheet without them.
const { G, G2, L, begin5, typeField, view, rowWith } = require('./lib_g5.js');
(async () => {
  const ctl = {};
  const t = await begin5(ctl);
  let ok = true, why = '';
  try {
    await G.seed(t, [G.readyBox({ id: 'h2', ok: false, flags: ['COUNT UNSURE — ALPHA SHOE: SAME ITEM OR MORE?'], proof: [{ line: 'ALPHA SHOE (1 TOTAL)', photos: ['h2p1'] }] })]);
    await G2.expand(t, 'h2');
    await t.page.click('[data-id="h2"] [data-act="lineqty"][data-d="1"]');
    await L.waitFor(t, `S.boxes.get('h2').row.contents === 'ALPHA SHOE (2 TOTAL)'`, 5000);
    await typeField(t, 'h2', 'note', 'ALSO 2 PHONE CASE');
    await t.page.waitForTimeout(400);
    await G.idle(t);
    const b = await view(t, 'h2');
    if (b.readNote !== 'ALSO 2 PHONE CASE') { ok = false; why += ' the note was not read: ' + JSON.stringify(b); }
    else if (b.sheetRow || rowWith(ctl, 'TBA111111111111').length) { ok = false; why += ' went into the sheet without the note’s items: ' + JSON.stringify(b); }
    else if (b.view !== 'check' || !b.reasons.some(r => /note changed after the contents were fixed by hand/i.test(r))) { ok = false; why += ' no warning: ' + JSON.stringify(b); }
    if (G.pageErrors(t).length) { ok = false; why += ' page errors: ' + G.pageErrors(t).join(' | '); }
  } catch (e) { ok = false; why += ' ' + e.message; }
  finally { await t.close(); }
  L.report('g5_hand_fix_note', ok, why);
})();

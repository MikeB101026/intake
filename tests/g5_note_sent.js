// F22 (a): a note typed on a box's card after it went into the sheet is read with the box: what the note adds shows as
// "Changed", ready for Update sheet row — never a "✓ Row" card with a NOTE chip whose items no read ever saw.
const { G, L, begin5, shot, typeField, view } = require('./lib_g5.js');
(async () => {
  const ctl = {};
  const t = await begin5(ctl);
  let ok = true, why = '';
  try {
    // Label + one item with the phone camera, Finish: read, then into the sheet by itself (auto-send is on).
    await shot(t, 'L1'); await shot(t, 'A');
    await t.page.click('#curFinish');
    await L.waitFor(t, 'allBoxes().some(b => b.sheetRow)', 30000);
    await G.idle(t);
    const id = await t.ev('allBoxes()[0].id');
    // The operator remembers something and types it in the card's "Note for Claude", then leaves the field.
    await typeField(t, id, 'note', 'ALSO 2 PHONE CASE');
    await t.page.waitForTimeout(400);
    await G.idle(t);
    const b = await view(t, id);
    if (b.readNote !== 'ALSO 2 PHONE CASE') { ok = false; why += ' the note was never read: ' + JSON.stringify(b); }
    else if (!/PHONE CASE/.test(b.contents) || b.view !== 'dirty') { ok = false; why += ' not Changed with the note’s line: ' + JSON.stringify(b); }
    const upd = await t.ev(`!!document.querySelector('[data-id="${id}"] [data-act="upd"]')`);
    if (ok && !upd) { ok = false; why += ' no Update sheet row button'; }
    if (G.pageErrors(t).length) { ok = false; why += ' page errors: ' + G.pageErrors(t).join(' | '); }
  } catch (e) { ok = false; why += ' ' + e.message; }
  finally { await t.close(); }
  L.report('g5_note_sent', ok, why);
})();

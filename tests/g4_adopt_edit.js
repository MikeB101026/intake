// F20: a send whose row went in but whose answer was lost; the operator then corrects the weight (9 → 12) before the
// row is found again — by the 30-s sync (A) or by tapping Send again (B). The box must then show "Changed" (the sheet
// still says 9) and Update must write 12. v37 noted the corrected values as what the sheet held: "✓ Row", no Update,
// and the next sync put 9 back on the card.
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'g4_adopt_edit';
(async () => {
  const ctl = { start: 106 };
  const t = await G.begin(ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await G.setLs(t, { autoSend: '0', nextRowSeen: '107' });
    await G.seed(t, [G.readyBox({ id: 'a', seq: 1, row: { customer: 'NINA COLE', tracking: 'TBA111111111111', weight: '9' } }),
      G.readyBox({ id: 'b', seq: 2, row: { customer: 'OMAR DAY', tracking: 'TBA222222222222', weight: '9' } })]);
    await G.idle(t);
    for (const [id, how] of [['a', 'sync'], ['b', 'send']]) {
      ctl.lose.append = 1;
      await t.ev(`planSend([S.boxes.get("${id}")])`); await G.idle(t);
      const row = G.rowsWith(ctl, id === 'a' ? 'TBA111111111111' : 'TBA222222222222')[0];
      if (!row) { fail(id + ': setup, no row written'); continue; }
      await t.ev(`patchBox("${id}", x => { x.row.weight = "12"; x.edited.weight = true; }).then(() => 1)`);   // the weight fixed on the card
      if (how === 'sync') await t.ev('syncDay()'); else await t.ev(`planSend([S.boxes.get("${id}")])`);
      await G.idle(t);
      let b = await G.box(t, id);
      if (b.sheetRow !== row) { fail(`${id} (${how}): row ${row} not taken as its own (${b.sheetRow})`); continue; }
      if (b.view !== 'dirty') fail(`${id} (${how}): shows "${b.view}" after the row was found, the sheet still says ${ctl.sheet.get(row).cells[3]}`);
      await t.ev('syncDay()'); await G.idle(t);
      b = await G.box(t, id);
      if (b.row.weight !== '12') fail(`${id} (${how}): the next sync put ${b.row.weight} back on the card`);
      if (b.view === 'dirty') { await t.ev('updateRows()'); await G.idle(t); }
      if (ctl.sheet.get(row).cells[3] !== '12') fail(`${id} (${how}): the sheet says ${ctl.sheet.get(row).cells[3]}`);
      if ((await G.box(t, id)).view !== 'sent') fail(`${id} (${how}): not "sent" after Update`);
    }
    if (ctl.sheet.size !== 2) fail('rows written: ' + [...ctl.sheet.keys()]);
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

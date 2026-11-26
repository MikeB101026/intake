// F21: the operator corrects the weight (20 → 22) of a box already in the sheet and taps "Update sheet row"; while the
// update is on its way they tap + on "PAINT (2 TOTAL)". The + must stay on the card (with its photo), show "Changed" and
// go out with the next Update (v37 put the card back to the cells taken before the tap: PAINT (2 TOTAL), "✓ Row",
// and the line lost its photo).
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'g4_update_merge';
(async () => {
  let open; const gate = new Promise(r => { open = r; });
  const ctl = { start: 106, gate: { update: gate } };
  const t = await G.begin(ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const u = G.G2.sentBox({ id: 'u', seq: 1, sheetRow: 107, photosLinked: true, row: { customer: 'JOHN SMITH', tracking: 'TBA111111111111', weight: '20', contents: 'PAINT (2 TOTAL)' } });
    u.proof = [{ line: 'PAINT (2 TOTAL)', photos: ['up1'] }];
    ctl.sheet.set(107, G.sheetRow(G.today(), u.sentCells.slice(0, 7), [{ id: 'ULINKxxxxxxxxxxxxxxxxxxxxx', label: 'LABEL 1' }]));
    await G.setLs(t, { autoSend: '0', nextRowSeen: '108' });
    await G.seed(t, [u]);
    await t.ev('patchBox("u", x => { x.row.weight = "22"; x.edited.weight = true; }).then(() => 1)');
    await G.G2.expand(t, 'u');
    await t.ev('updateRows(), 1');
    await L.waitFor(t, 'S.busy', 5000);
    while (!ctl.ops.includes('update')) await L.sleep(20);          // the update is on its way
    await t.page.click('[data-id="u"] [data-act="lineqty"][data-d="1"]');
    await L.waitFor(t, 'S.boxes.get("u").row.contents === "PAINT (3 TOTAL)"', 5000);
    open(); await G.idle(t);
    const b = await G.box(t, 'u'), proof = await t.ev('JSON.stringify(S.boxes.get("u").proof)').then(JSON.parse);
    if (ctl.sheet.get(107).cells[3] !== '22') fail('the weight didn\'t go in: ' + ctl.sheet.get(107).cells[3]);
    if (b.row.contents !== 'PAINT (3 TOTAL)') fail('the + made during the update was undone: ' + b.row.contents);
    if (b.view !== 'dirty') fail('shows "' + b.view + '", not "Changed"');
    if (!(proof[0] && proof[0].photos && proof[0].photos.length === 1)) fail('the line lost its photo: ' + JSON.stringify(proof));
    if (b.view === 'dirty') { await t.ev('updateRows()'); await G.idle(t); }
    if (ctl.sheet.get(107).cells[6] !== 'PAINT (3 TOTAL)') fail('the sheet says ' + ctl.sheet.get(107).cells[6]);
    if ((await G.box(t, 'u')).view !== 'sent') fail('not "sent" after the second Update');
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { open(); await t.close(); }
  L.report(NAME, ok, why);
})();

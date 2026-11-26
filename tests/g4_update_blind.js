// F16: "Update sheet row" must never write the phone's whole row without first reading the row back. (A) The office
// typed a weight (31) and a shipper (WAYFAIR) into KAY MOSS's row; the card changes a count and Update runs while the
// sheet can't be read (dayRows fails): nothing may be written, the card stays "Changed" and says why; once the sheet
// can be read the update keeps 31 / WAYFAIR. (B) A row too far back for the backend to return is not written either.
// (v37 wrote all 7 cells: the weight went blank and WAYFAIR went back to AMAZON.)
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'g4_update_blind';
(async () => {
  const ctl = { start: 106 };
  const t = await G.begin(ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const old = G.daysAgo(4);
    const k = G.G2.sentBox({ id: 'k', seq: 1, sheetRow: 107, photosLinked: true, row: { customer: 'KAY MOSS', tracking: 'TBA111111111111', weight: '', shipper: 'AMAZON', contents: 'LINENS (2 TOTAL)' } });
    const o = G.G2.sentBox({ id: 'o', seq: 1, day: old, sentAt: Date.now() - 4 * 86400000, createdAt: Date.now() - 4 * 86400000, sheetRow: 108, photosLinked: true, row: { customer: 'OLGA PETROVA', tracking: 'TBA222222222222', weight: '7', shipper: 'AMAZON', contents: 'BRAVO SOCK (1 TOTAL)' } });
    ctl.sheet.set(107, G.sheetRow(G.today(), k.sentCells.slice(0, 7), []));
    ctl.sheet.set(108, G.sheetRow(old, o.sentCells.slice(0, 7), []));
    await G.setLs(t, { autoSend: '0', nextRowSeen: '109' });
    await G.seed(t, [k, o]);
    // (A) the office's fix; the card changes a count; Update while the sheet can't be read
    Object.assign(ctl.sheet.get(107).cells, { 3: '31', 4: 'WAYFAIR' });
    await t.ev('patchBox("k", x => { x.row.contents = "LINENS (3 TOTAL)"; x.edited.contents = true; }).then(() => 1)');
    ctl.fail = ['dayRows'];
    await t.ev('updateRows()'); await G.idle(t);
    let r = ctl.sheet.get(107).cells;
    if (r[3] !== '31' || r[4] !== 'WAYFAIR' || r[6] !== 'LINENS (2 TOTAL)') fail('written without reading the row back: ' + JSON.stringify(r));
    if ((await G.box(t, 'k')).view !== 'dirty') fail('the card no longer shows "Changed"');
    if (!/Couldn’t check row 107/.test(await G.noticeText(t))) fail('no notice: ' + await G.noticeText(t));
    if (/Updated/.test(await t.page.textContent('#barMsg'))) fail('says "' + await t.page.textContent('#barMsg') + '" though nothing was written');
    ctl.fail = [];
    await t.ev('updateRows()'); await G.idle(t);
    r = ctl.sheet.get(107).cells;
    if (r[3] !== '31' || r[4] !== 'WAYFAIR' || r[6] !== 'LINENS (3 TOTAL)') fail('the update after: ' + JSON.stringify(r));
    // (B) a box of 4 days ago; 600 rows have gone into the sheet since, so the backend doesn't return its row
    ctl.sheet.set(708, G.sheetRow(G.today(), ['LAST ROW', 'TBA999999999999', '1', '1', 'AMAZON', 'NO INVOICE', ''], []));
    ctl.sheet.get(108).cells[4] = 'WAYFAIR';
    await t.ev(`S.day = "${old}", render(), 1`);
    await t.ev('syncDay()'); await G.idle(t);
    await t.ev('patchBox("o", x => { x.row.weight = "8"; x.edited.weight = true; }).then(() => 1)');
    await t.ev('updateRows()'); await G.idle(t);
    r = ctl.sheet.get(108).cells;
    if (r[4] !== 'WAYFAIR' || r[3] !== '7') fail('a row out of reach written blind: ' + JSON.stringify(r));
    if ((await G.box(t, 'o')).view !== 'dirty') fail('box o no longer "Changed"');
    if (!/Couldn’t find row 108/.test(await G.noticeText(t))) fail('no notice for row 108: ' + await G.noticeText(t));
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

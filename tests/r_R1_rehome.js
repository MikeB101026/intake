// R1: two pallets on one bill of lading are two rows with one number: KAY MOSS rows 104 (pallet 1, 400 lb) and 105
// (pallet 2, 350 lb), both this phone's; LIAM NOLAN rows 106 (another phone's pallet, its card deleted here after
// "Keep one") and 107 (this phone's). The office adds the carrier's PRO to rows 105 and 107. Each card must stay on its
// own row and take the new number (v38 moved it onto the other pallet's row, the only one left with the old number,
// and brought its own row back as an extra card). Then the weights fixed on the cards and Update go to rows 105 / 107,
// and their photo saves go there too: rows 104 / 106 and their AV–BJ links stay as they are.
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'r_R1_rehome';
const PORT = +process.env.PORT || 10001;
(async () => {
  const ctl = { start: 107 };
  const t = await G.begin(ctl, { port: PORT, repo: process.env.REPO || require('path').resolve(__dirname, '..') });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const day = G.today(), BOL = 'DELIVERED BY ESTES BOL: 55512345', BOL2 = 'DELIVERED BY ABF BOL: 66612345';
    const p1 = G.G2.sentBox({ id: 'p1', seq: 4, sheetRow: 104, photosLinked: true, row: { customer: 'KAY MOSS', tracking: BOL, weight: '400', shipper: 'ESTES', contents: 'TILE PALLET (1 TOTAL)' } });
    const p2 = G.G2.sentBox({ id: 'p2', seq: 5, sheetRow: 105, photosLinked: true, row: { customer: 'KAY MOSS', tracking: BOL, weight: '350', shipper: 'ESTES', contents: 'GROUT PALLET (1 TOTAL)' } });
    const q2 = G.G2.sentBox({ id: 'q2', seq: 7, sheetRow: 107, photosLinked: true, row: { customer: 'LIAM NOLAN', tracking: BOL2, weight: '120', shipper: 'ABF', contents: 'SOFA PALLET (1 TOTAL)' } });
    const links = id => [{ id: id + 'LINKEDPHOTOxxxxxxxxxxxxxxx', label: 'LABEL 1' }];
    ctl.sheet.set(104, G.sheetRow(day, p1.sentCells.slice(0, 7), links('P1')));
    ctl.sheet.set(105, G.sheetRow(day, p2.sentCells.slice(0, 7), links('P2')));
    ctl.sheet.set(106, G.sheetRow(day, ['LIAM NOLAN', BOL2, '1', '90', 'ABF', 'NO INVOICE', 'CHAIR PALLET (1 TOTAL)'], links('OTHER')));
    ctl.sheet.set(107, G.sheetRow(day, q2.sentCells.slice(0, 7), links('Q2')));
    await G.setLs(t, { autoSend: '0', nextRowSeen: '108' });
    await G.seed(t, [p1, p2, q2]);                    // its start-up sync shows row 106 as the other phone's card
    const theirs = (await G.boxes(t)).find(b => b.imported && b.sheetRow === 106);
    if (!theirs) throw new Error('row 106 not shown as the other phone\'s card');
    await t.ev(`deleteBox(${JSON.stringify(theirs.id)})`); await G.idle(t);   // "Same tracking … Keep one"
    const pics104 = JSON.stringify(ctl.sheet.get(104).pics), pics106 = JSON.stringify(ctl.sheet.get(106).pics);
    // the office adds the PRO numbers
    ctl.sheet.get(105).cells[1] = BOL + ' PRO: 777888999';
    ctl.sheet.get(107).cells[1] = BOL2 + ' PRO: 888999000';
    await t.ev('syncDay()'); await G.idle(t);
    await t.ev('syncDay()'); await G.idle(t);
    const all = await G.boxes(t), by = id => all.find(b => b.id === id);
    if (by('p2').sheetRow !== 105) fail(`pallet 2 moved to row ${by('p2').sheetRow}`);
    if (by('p2').tracking !== BOL + ' PRO: 777888999') fail('pallet 2 didn\'t take its row\'s new number: ' + by('p2').tracking);
    if (by('p1').sheetRow !== 104 || by('p1').weight !== '400') fail(`pallet 1 now row ${by('p1').sheetRow}, ${by('p1').weight} lb`);
    if (by('q2').sheetRow !== 107) fail(`LIAM NOLAN's pallet moved to row ${by('q2').sheetRow} (the other phone's row)`);
    if (by('q2').weight !== '120') fail('LIAM NOLAN\'s card took the other pallet\'s weight: ' + by('q2').weight);
    const extra = all.filter(b => b.imported);
    if (extra.length) fail('extra cards: ' + extra.map(b => `#${b.seq} ${b.customer} row ${b.sheetRow}`).join(', '));
    // the operator fixes the weights on the cards and taps Update sheet row on pallet 2's card
    await G.G2.expand(t, 'p2');
    await t.page.fill('#wt-p2', '360'); await t.page.press('#wt-p2', 'Tab'); await G.idle(t);
    await t.ev('patchBox("q2", x => { x.row.weight = "125"; x.edited.weight = true; }).then(() => 1)');
    await t.page.click('[data-id="p2"] [data-act="upd"]'); await G.idle(t);
    const w = n => ctl.sheet.get(n).cells[3];
    if (w(105) !== '360' || w(104) !== '400') fail(`Update: row 104 ${w(104)} lb, row 105 ${w(105)} lb (${await G.noticeText(t)})`);
    if (w(107) !== '125' || w(106) !== '90') fail(`Update: row 106 ${w(106)} lb, row 107 ${w(107)} lb`);
    if (ctl.writes.some(x => x.op === 'update' && (x.row === 104 || x.row === 106))) fail('Update wrote the other pallet\'s row');
    // their photos are saved again (a photo changed on the card)
    const up0 = ctl.uploads.length;
    await t.ev('patchBox("p2", x => { x.photosLinked = false; }).then(() => patchBox("q2", x => { x.photosLinked = false; })).then(() => { queueLinks("p2"); queueLinks("q2"); return 1; })');
    await G.idle(t);
    const rows = ctl.uploads.slice(up0).map(u => u.row).sort();
    if (JSON.stringify(rows) !== '[105,107]') fail('photo saves went to rows ' + JSON.stringify(rows));
    if (JSON.stringify(ctl.sheet.get(104).pics) !== pics104) fail('pallet 1\'s links (row 104) replaced');
    if (JSON.stringify(ctl.sheet.get(106).pics) !== pics106) fail('the other phone\'s links (row 106) replaced');
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

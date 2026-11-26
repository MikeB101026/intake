// R14: a box went in with a hard-to-read label (NO NAME ON LABEL and a misread UPS number, row 105); another phone's
// box went in the same way (row 106, shown here as its card). The office types the right name and number into both
// rows. Each card must take its corrected row over — one card per row (v38 brought each row back as a second card and
// left the old card on it, stuck "Changed": its Update and photo saves were refused for good). Then the weight fixed on
// the card goes to row 105, and its photos save there. Control (F10): a row deleted by hand, so another phone's box
// slides onto this box's row number, is still never taken over.
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'r_R14_both_fixed';
const PORT = +process.env.PORT || 10003;
(async () => {
  const ctl = { start: 108 };
  const t = await G.begin(ctl, { port: PORT, repo: process.env.REPO || require('path').resolve(__dirname, '..') });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const day = G.today(), OLD = '1Z999AA10123456784', NEW = '1Z999AA10123456794';
    const x = G.G2.sentBox({ id: 'x', seq: 1, sheetRow: 105, photosLinked: true, row: { customer: 'NO NAME ON LABEL', tracking: OLD, weight: '7', contents: 'BRAVO SOCK (1 TOTAL)' }, _shapes: ['L2', 'B'] });
    const bob = G.G2.sentBox({ id: 'bob', seq: 3, sheetRow: 108, photosLinked: true, row: { customer: 'BOB KING', tracking: 'TBA555555555555', weight: '6', contents: 'BRAVO SOCK (1 TOTAL)' } });
    ctl.sheet.set(105, G.sheetRow(day, x.sentCells.slice(0, 7), [{ id: 'XLINKEDPHOTOxxxxxxxxxxxxxxx', label: 'LABEL 1' }]));
    ctl.sheet.set(106, G.sheetRow(day, ['NO NAME ON LABEL', '1Z999AA10123456811', '1', '3', 'AMAZON', 'NO INVOICE', 'CHARLIE LAMP (1 TOTAL)'], [{ id: 'OTHERPHONEPHOTOxxxxxxxxxxxx', label: 'LABEL 1' }]));
    ctl.sheet.set(108, G.sheetRow(day, bob.sentCells.slice(0, 7), [{ id: 'BOBLINKEDPHOTOxxxxxxxxxxxxx', label: 'LABEL 1' }]));
    await G.setLs(t, { autoSend: '0', nextRowSeen: '109' });
    await G.seed(t, [x, bob]);                         // its start-up sync shows row 106 as the other phone's card
    const imp = (await G.boxes(t)).find(b => b.imported && b.sheetRow === 106);
    if (!imp) throw new Error('row 106 not shown as the other phone\'s card');
    // the office fixes name and number of rows 105 and 106 (between two syncs of this phone)
    Object.assign(ctl.sheet.get(105).cells, { 0: 'MARY JONES', 1: NEW });
    Object.assign(ctl.sheet.get(106).cells, { 0: 'PETER PAN', 1: '1Z999AA10123456822' });
    await t.ev('syncDay()'); await G.idle(t);
    await t.ev('syncDay()'); await G.idle(t);
    const all = await G.boxes(t);
    const on = n => all.filter(b => b.sheetRow === n).map(b => `#${b.seq} ${b.customer}`);
    if (JSON.stringify(on(105)) !== '["#1 MARY JONES"]') fail('row 105 cards: ' + JSON.stringify(on(105)));
    if (JSON.stringify(on(106)) !== `["#${imp.seq} PETER PAN"]`) fail('row 106 cards: ' + JSON.stringify(on(106)));
    if (all.find(b => b.id === 'x').tracking !== NEW) fail('card #1 kept the old number');
    // the operator fixes the weight on card #1 and taps Update
    await t.ev('patchBox("x", x => { x.row.weight = "8"; x.edited.weight = true; }).then(() => 1)');
    await t.ev('updateRows()'); await G.idle(t);
    const xb = await G.box(t, 'x');
    if (ctl.sheet.get(105).cells[3] !== '8' || xb.view !== 'sent') fail(`Update: row 105 weight ${ctl.sheet.get(105).cells[3]}, card ${xb.view}, notice: ${await G.noticeText(t)}`);
    // its photos are saved again (a photo changed on the card): the backend's tracking check takes them
    await t.ev('patchBox("x", x => { x.photosLinked = false; }).then(() => { queueLinks("x"); return 1; })'); await G.idle(t);
    if (!ctl.uploads.some(u => u.row === 105 && u.n === 2) || !(await G.box(t, 'x')).linked) fail('photos not saved to row 105: ' + JSON.stringify(ctl.uploads) + ' ' + (await G.box(t, 'x')).linkError);
    // F10 control: another phone's box goes in at 109 (not seen here yet); BOB's own row 108 is deleted by hand, so it
    // slides onto BOB's row number
    ctl.sheet.set(109, G.sheetRow(day, ['CARL ROSS', 'TBA666666666666', '1', '9', 'AMAZON', 'NO INVOICE', 'CHARLIE LAMP (1 TOTAL)'], [{ id: 'CARLLINKEDPHOTOxxxxxxxxxxxx', label: 'LABEL 1' }]));
    G.deleteRow(ctl, 108);
    await t.ev('syncDay()'); await G.idle(t);
    const b2 = await G.box(t, 'bob');
    if (b2.row.customer !== 'BOB KING' || b2.row.weight !== '6') fail(`BOB's card took the row that slid onto its number: ${b2.row.customer}, ${b2.row.weight} lb`);
    if (!(await G.boxes(t)).some(b => b.imported && b.customer === 'CARL ROSS' && b.sheetRow === 108)) fail('CARL\'s row not shown as its own card');
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

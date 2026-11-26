// F30: "NOT IN FRAME — RESHOOT" (a cut-off label) or a number with an unreadable character (?) is not a tracking number.
// (1) Two different cut-off packages must not be called "the same box photographed twice". (2) Sending one after
// "Looks good" while another phone's cut-off row sits in the sheet must give it its own row — v37 took that row over
// without a word ("already in the sheet … nothing written twice") and the other package's photo links with it.
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'g4_placeholder';
(async () => {
  const ctl = { start: 119 };
  const t = await G.begin(ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const cut = 'NOT IN FRAME — RESHOOT';
    if (await t.ev('trkId("1Z999AA1?123456784")') !== '') fail('a number with "?" counts as a tracking number');
    await G.setLs(t, { autoSend: '0', nextRowSeen: '120' });
    await G.seed(t, [G.readyBox({ id: 'ann', seq: 1, row: { customer: 'ANNA SMITH', tracking: cut, weight: '3' } }),
      G.readyBox({ id: 'bob', seq: 2, row: { customer: 'BOB JONES', tracking: cut, weight: '8', contents: 'BRAVO SOCK (1 TOTAL)' } })]);
    await G.idle(t);
    const rs = (await G.box(t, 'bob')).reasons;
    if (rs.some(r => /Same tracking/.test(r))) fail('cut-off labels called the same box: ' + JSON.stringify(rs));
    // another phone's cut-off box goes into the sheet after this phone last looked; then BOB is sent
    ctl.sheet.set(120, G.sheetRow(G.today(), ['CARLA DIAZ', cut, '1', '5', 'AMAZON', 'NO INVOICE', 'CHARLIE LAMP (1 TOTAL)'], [{ id: 'CARLAPHOTOxxxxxxxxxxxxxxxxx', label: 'LABEL 1' }]));
    await t.ev('planSend([S.boxes.get("bob")])');
    await G.idle(t);
    const bob = await G.box(t, 'bob');
    if (bob.sheetRow === 120) fail('BOB was put on CARLA\'s row 120: ' + await G.noticeText(t));
    else if (!bob.sheetRow || ctl.sheet.get(bob.sheetRow).cells[0] !== 'BOB JONES') fail('BOB not written to a row of its own: ' + JSON.stringify(bob.sheetRow) + ' ' + await G.noticeText(t));
    if (ctl.sheet.get(120).cells[0] !== 'CARLA DIAZ' || ctl.sheet.get(120).pics[0].id !== 'CARLAPHOTOxxxxxxxxxxxxxxxxx') fail('CARLA\'s row changed');
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

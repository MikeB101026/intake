// F18: "Send 3 to sheet" finds that #1 is already in the sheet, and the repeat bar opens. While it is open the operator
// sends #2 from its own card, and deletes #3. Then "Skip it": nothing may be written again (v37 worked from the list
// made when the bar opened: #2 went into the sheet a second time, and deleted #3 was written too). With nothing left
// to send the bar closes.
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'g4_stale_plan';
(async () => {
  const ctl = { start: 8011 };
  const t = await G.begin(ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    ctl.sheet.set(8009, G.sheetRow(G.daysAgo(6), ['TOM GREEN', 'TBA111111111111', '1', '4', 'AMAZON', 'NO INVOICE', 'ALPHA SHOE (1 TOTAL)'], []));
    await G.setLs(t, { autoSend: '0', nextRowSeen: '8012' });
    await G.seed(t, [G.readyBox({ id: 'c1', seq: 1, row: { customer: 'TOM GREEN', tracking: 'TBA111111111111' } }),
      G.readyBox({ id: 'c2', seq: 2, row: { customer: 'ANN BLUE', tracking: 'TBA222222222222' } }),
      G.readyBox({ id: 'c3', seq: 3, row: { customer: 'SAM RED', tracking: 'TBA333333333333' } })]);
    if (await t.page.textContent('#sendBtn') !== 'Send 3 to sheet') fail('setup: ' + await t.page.textContent('#sendBtn'));
    await t.page.click('#sendBtn'); await G.idle(t);
    if (await t.ev('!S.plan')) fail('no repeat bar');
    await G.G2.expand(t, 'c2');
    await t.page.click('[data-id="c2"] [data-act="send1"]'); await G.idle(t);
    if (G.rowsWith(ctl, 'TBA222222222222').length !== 1) fail('setup: #2 not sent from its card');
    await t.ev('deleteBox("c3")'); await G.idle(t);
    await t.page.click('#planSkip'); await G.idle(t);
    const n2 = G.rowsWith(ctl, 'TBA222222222222').length, n3 = G.rowsWith(ctl, 'TBA333333333333').length;
    if (n2 !== 1) fail(`#2 written ${n2} times`);
    if (n3 !== 0) fail(`deleted #3 written ${n3} times`);
    if (!(await t.ev('document.querySelector("#plan").hidden'))) fail('the bar is still open with nothing left to send');
    const c1 = await G.box(t, 'c1');
    if (c1.sheetRow) fail('#1 went to row ' + c1.sheetRow);
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

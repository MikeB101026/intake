// R19: on 25 NOV two boxes are shot whose tracking numbers are already in the sheet (rows 98 and 99, an earlier day):
// auto-send holds them for the operator, who leaves them. At each start of the app on 26 NOV they must not be checked
// again by themselves (v38: an append and a red "already in the sheet … Check it, then tap Send" notice at every start),
// and the bottom button still names them. A box whose tracking is then fixed goes in by itself; the other stays held.
// A tap on Send checks it again (the repeat bar), and the hold is lifted.
const { start } = require('./h.js');
const G = require('./lib_g3.js'), L = G.L;
const NAME = 'r_R19_held';
const PORT = +process.env.PORT || 10005;
const appendsSince = (t, n) => t.calls.slice(n).filter(c => c.op === 'append').length;
(async () => {
  const old = (row, cust, trk) => ({ row, day: '2026-11-20', cells: [cust, trk, '1', '4', 'AMAZON', 'NO INVOICE', 'ALPHA SHOE (1 TOTAL)'], pics: [{ id: 'x'.repeat(24) + row, label: 'LABEL 1' }] });
  const ctl = { sheet: { rows: [old(98, 'MARY JONES', 'TBA222222222222'), old(99, 'JOHN SMITH', 'TBA111111111111')], next: 100 } };
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: G.makeBackend3(ctl) });
  await t.page.clock.install({ time: G.at(2026, 11, 25, 15, 0) });
  await G.reload(t);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await L.waitFor(t, '!!S.watch', 15000);
    await G.shot(t, 'L1'); await G.shot(t, 'A'); await G.finish(t);
    await G.shot(t, 'L2'); await G.shot(t, 'B'); await G.finish(t);
    let bx = await G.boxes(t);
    if (bx.length !== 2 || bx.some(b => b.sheetRow)) throw new Error('setup: ' + JSON.stringify(bx));
    if (!/already in the sheet at row 98/.test(await G.noticeText(t))) throw new Error('setup: not held: ' + await G.noticeText(t));
    const id1 = bx.find(b => b.tracking === 'TBA111111111111').id, id2 = bx.find(b => b.tracking === 'TBA222222222222').id;
    // later starts of the app, the next day
    for (const [h, m] of [[8, 0], [10, 0]]) {
      await t.page.clock.setSystemTime(G.at(2026, 11, 26, h, m));
      const c0 = t.calls.length;
      await G.reload(t);
      await L.waitFor(t, '!!S.watch', 15000); await t.page.waitForTimeout(800); await L.waitIdle(t, 20000);
      const n = await G.noticeText(t);
      if (appendsSince(t, c0)) fail(`start at ${h}:00: checked again by itself (${appendsSince(t, c0)} sends)`);
      if (/already in the sheet/.test(n)) fail(`start at ${h}:00: notice "${n}"`);
    }
    const btn = await t.page.textContent('#sendBtn');
    if (!/^2 boxes of 25 NOV not in the sheet/.test(btn)) fail('the bottom button doesn\'t name them: ' + btn);
    // the tracking of box 2 is fixed (a misread): it goes in by itself; box 1 stays held
    const c1 = t.calls.length;
    await t.ev(`patchBox(${JSON.stringify(id2)}, x => { x.row.tracking = "TBA555555555555"; x.edited.tracking = true; }).then(() => (autoSend(), 1))`);
    await t.page.waitForTimeout(500); await L.waitIdle(t, 20000);
    if (G.rowsWith(ctl, 'TBA555555555555').length !== 1) fail('box 2 with its fixed tracking not sent by itself');
    if (appendsSince(t, c1) !== 1) fail(`${appendsSince(t, c1)} sends after the fix (box 1 checked again?)`);
    if (G.rowsWith(ctl, 'TBA111111111111').length !== 1) fail('box 1 written');
    // the operator opens 25 NOV and taps Send on box 1: it is checked again (the repeat bar), and the hold is lifted
    await t.page.click('#sendBtn'); await L.waitIdle(t, 20000);
    if (await t.ev('S.day') !== '2026-11-25') fail('the bottom button didn\'t open 25 NOV');
    await t.page.click('#sendBtn'); await t.page.waitForTimeout(300); await L.waitIdle(t, 20000);
    const bar = await t.ev('document.querySelector("#plan").hidden ? "" : document.querySelector("#plan").textContent');
    if (!/row 99/.test(bar)) fail('no repeat bar after the tap: ' + bar + ' / ' + await G.noticeText(t));
    if (await t.ev(`!!S.boxes.get(${JSON.stringify(id1)}).heldTrk`)) fail('the hold is still on box 1 after the tap');
    if (bar) await t.page.click('#planCancel');
    if (G.rowsWith(ctl, 'TBA111111111111').length !== 1) fail('box 1 written');
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

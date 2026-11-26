// F24 (a send that failed is tried again by itself): after a failed automatic send the box goes again within 2 minutes,
// and at once when the phone is back online. A box whose earlier send may already be in the sheet and whose tracking
// can't find that row again (a short number) is not sent again by itself: it would be written twice; it waits for a tap.
// (v37: nothing retried a failed send until another box finished reading.)
const G = require('./lib_g3.js'), L = G.L;
const NAME = 'g3_send_retry';
(async () => {
  const ctl = {};
  L.LABELS.L4 = { customer: 'JANE DOE', tracking: '482913', weight: '20' };   // a courier's short number: not unique
  const t = await G.startAt(G.at(2026, 11, 25, 10, 0), ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    // 1) no signal when the box goes; signal back; nothing else happens for 2 minutes
    ctl.appendFail = true;
    await G.shot(t, 'L1'); await G.shot(t, 'A'); await G.finish(t);
    if (G.rowsWith(ctl, 'TBA111111111111').length) fail('written while offline?');
    const n1 = ctl.appends;
    ctl.appendFail = false;
    await t.page.clock.fastForward('02:01');
    await t.page.waitForTimeout(300); await L.waitIdle(t, 30000);
    if (G.rowsWith(ctl, 'TBA111111111111').length !== 1) fail(`not sent again within 2 minutes (${ctl.appends - n1} tries)`);
    // 2) fails again; the phone says it is back online
    ctl.appendFail = true;
    await G.shot(t, 'L2'); await G.shot(t, 'B'); await G.finish(t);
    ctl.appendFail = false;
    await t.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await t.page.waitForTimeout(300); await L.waitIdle(t, 30000);
    if (G.rowsWith(ctl, 'TBA222222222222').length !== 1) fail('not sent again when back online');
    // 3) the row goes in but its answer is lost; the retries and the next box's send must not write it twice
    ctl.loseReply = 1;
    await G.shot(t, 'L4'); await G.shot(t, 'C'); await G.finish(t);
    if (G.rowsWith(ctl, '482913').length !== 1) fail('short-number box: ' + G.rowsWith(ctl, '482913').length + ' rows after its first send');
    await t.page.clock.fastForward('02:01');
    await t.page.waitForTimeout(300); await L.waitIdle(t, 30000);
    await t.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await t.page.waitForTimeout(300); await L.waitIdle(t, 30000);
    await G.shot(t, 'L3'); await G.shot(t, 'D'); await G.finish(t);
    if (G.rowsWith(ctl, 'TBA333333333333').length !== 1) fail('the next box was not sent');
    if (G.rowsWith(ctl, '482913').length !== 1) fail('short-number box written ' + G.rowsWith(ctl, '482913').length + ' times');
    // It waits for a tap — or (since G4/F14) the sync has found the row that went in as its own and marked it as sent there.
    const btn = await t.page.textContent('#sendBtn'), sb = (await G.boxes(t)).find(b => b.tracking === '482913');
    if (btn !== 'Send 1 to sheet' && !(sb && sb.sheetRow === G.rowsWith(ctl, '482913')[0].row)) fail('the short-number box is not offered for a tap: ' + btn);
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

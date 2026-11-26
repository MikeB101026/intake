// F24 (boxes of an earlier day are never stranded): the evening's last box whose send failed goes in by itself the next
// morning, with its own date, and the bottom button never says "Nothing ready to send" / "✓ All sent" while a box of
// another day isn't in the sheet — it says so, and a tap opens that day. (v37: after the app restarted on the new day,
// unsent boxes of the day before were left out of sending, the list and the button.)
const G = require('./lib_g3.js'), L = G.L;
const NAME = 'g3_earlier_day';
(async () => {
  const ctl = {};
  const D = G.at(2026, 11, 25, 17, 0), M = G.at(2026, 11, 26, 8, 0), d0 = G.key(D), d1 = G.key(M);
  const t = await G.startAt(D, ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    ctl.appendFail = true;                                             // no signal for the evening's last send
    await G.shot(t, 'L1'); await G.shot(t, 'A'); await G.finish(t);
    await G.shot(t, 'B'); await G.finish(t);                           // a box with no label: waits on Check
    let bx = await G.boxes(t);
    if (bx.length !== 2 || bx.some(b => b.sheetRow) || bx[0].view !== 'ready' || bx[1].view !== 'check') fail('evening: ' + JSON.stringify(bx));
    // Next morning: the app is opened again and the signal is back.
    ctl.appendFail = false;
    await t.page.clock.setSystemTime(M);
    await G.reload(t);
    await L.waitFor(t, 'allBoxes().some(b => b.sheetRow)', 15000).catch(() => {});
    await L.waitIdle(t, 30000);
    if ((await t.ev('S.day')) !== d1) fail('not on today: ' + await t.ev('S.day'));
    const r1 = G.rowsWith(ctl, 'TBA111111111111');
    if (r1.length !== 1 || r1[0].day !== d0) fail('the evening box did not go in with its day: ' + JSON.stringify(r1));
    const msg = await t.page.textContent('#barMsg');
    if (!/#1 of 25 NOV 2026/.test(msg)) fail('the send does not name the day: ' + msg);
    // The Check box of the day before is still not in the sheet: the button says so, and a tap opens that day.
    const btn = await t.page.textContent('#sendBtn');
    if (btn !== '1 box of 25 NOV not in the sheet — tap to open that day') fail('button: ' + btn);
    if (await t.ev('document.querySelector("#sendBtn").disabled')) fail('button disabled');
    await t.page.click('#sendBtn', { timeout: 3000 });
    await t.page.waitForTimeout(300);
    if ((await t.ev('S.day')) !== d0) fail('tap did not open the day: ' + await t.ev('S.day'));
    const cards = await t.page.$$eval('#boxes > [data-id]', els => els.length);
    if (cards !== 2) fail('cards on that day: ' + cards);
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

// R29: the notice for a box the app finished by itself says what really happens. (a) Friday 20 NOV 17:50: box #1's send
// fails (no signal); box #2 is shot, Finish not tapped. Monday 08:00 the app is opened: the notice says to open 20 NOV,
// check it, tap Looks good and Send (before: "it will go into the sheet with that date", yet 5 minutes later nothing had
// gone in — Friday isn't a day auto-send covers on a Monday). 5 minutes later it still says that, and nothing went in.
// Doing what it says puts both boxes in with 20 NOV. (b) Not linked: "It is read once this device is linked", then the
// same steps, never a promise.
const { start } = require('./h.js');
const G = require('./lib_g3.js'), L = G.L, G2 = require('./lib_g2.js');
const NAME = 'r_R29_notice';
const PORT = +process.env.PORT || 10610;
const REPO = process.env.REPO || require('path').resolve(__dirname, '..');
(async () => {
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const SAYS = (n, day, read) => new RegExp(`^Box #${n} of ${day} was left in progress\\. ${read} — open ${day} \\(button at the bottom or the day list\\), check it, then tap “Looks good” and Send\\. It goes in with that date\\.`);
  // (a) linked, a weekend in between
  const ctl = {};
  let t = await start({ repo: REPO, port: PORT, backend: G.makeBackend3(ctl) });
  try {
    const F = G.at(2026, 11, 20, 17, 50), MON = G.at(2026, 11, 23, 8, 0), fri = G.key(F);
    await t.page.clock.install({ time: F }); await G.reload(t);
    ctl.appendFail = true;                                          // Friday evening: no signal for the send
    await G.shot(t, 'L1'); await G.shot(t, 'A'); await G.finish(t);
    await G.shot(t, 'L2'); await G.shot(t, 'B');                    // box #2, Finish not tapped
    const b2 = await t.ev('S.current');
    if (ctl.sheet.rows.length) throw new Error('setup: a row went in on Friday');
    ctl.appendFail = false;
    await t.page.clock.setSystemTime(MON);
    await G.reload(t);
    const n1 = await G.noticeText(t);
    if (!SAYS(2, '20 NOV 2026', 'It is being read now').test(n1)) fail('notice at start-up: ' + JSON.stringify(n1));
    for (let i = 0; i < 10; i++) { await t.page.clock.runFor(30000); await t.page.waitForTimeout(60); }   // 5 minutes on
    await L.waitIdle(t, 30000);
    const n2 = await G.noticeText(t);
    if (n2 !== n1) fail('notice 5 minutes later: ' + JSON.stringify(n2));
    if (ctl.sheet.rows.length) fail('went in by itself: ' + JSON.stringify(ctl.sheet.rows));
    // the operator does what it says
    const bar = (await t.page.textContent('#sendBtn')).trim();
    if (bar !== '2 boxes of 20 NOV not in the sheet — tap to open that day') fail('bar: ' + bar);
    await t.page.selectOption('#daySel', fri); await t.page.waitForTimeout(300); await L.waitIdle(t, 30000);
    await G2.expand(t, b2);
    if (await t.ev(`!!document.querySelector('[data-id="${b2}"] [data-act="ok"]')`)) await t.page.click(`[data-id="${b2}"] [data-act="ok"]`);
    await t.page.waitForTimeout(300);
    const bar2 = (await t.page.textContent('#sendBtn')).trim();
    if (bar2 !== 'Send 2 to sheet') fail('bar after Looks good: ' + bar2);
    else { await t.page.click('#sendBtn'); await L.waitFor(t, `!!S.boxes.get(${JSON.stringify(b2)}).sheetRow`, 20000).catch(() => {}); await L.waitIdle(t, 30000); }
    const rows = ctl.sheet.rows.map(r => r.day + ' ' + r.cells[0]);
    if (JSON.stringify(rows) !== JSON.stringify([`${fri} JOHN SMITH`, `${fri} MARY JONES`])) fail('sheet: ' + JSON.stringify(rows));
    if (G.pageErrors(t).length) fail('page errors (a) ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception (a) ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  // (b) not linked: Tuesday's box left in progress, the app opened on Wednesday
  t = await start({ repo: REPO, port: PORT + 1, linked: false });
  try {
    const TUE = G.at(2026, 11, 24, 17, 50), WED = G.at(2026, 11, 25, 8, 0);
    await t.page.clock.install({ time: TUE }); await G.reload(t);
    await G.shot(t, 'L1'); await G.shot(t, 'A');
    await t.page.clock.setSystemTime(WED);
    await G.reload(t);
    const n = await G.noticeText(t);
    if (!SAYS(1, '24 NOV 2026', 'It is read once this device is linked').test(n)) fail('notice, not linked: ' + JSON.stringify(n));
    if (G.pageErrors(t).length) fail('page errors (b) ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception (b) ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

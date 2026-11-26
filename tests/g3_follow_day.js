// F24 (app left open across midnight): the day on screen follows the clock — an operator who was looking at today gets
// the new today, its boxes are listed and sent by themselves — and today's boxes are sent whatever day is on screen.
// An operator who picked an earlier day in the list stays there, even when the date changes again.
// (v37: the list stayed on the old day; boxes shot after midnight were hidden and never sent by themselves.)
const G = require('./lib_g3.js'), L = G.L;
const NAME = 'g3_follow_day';
(async () => {
  const ctl = {};
  const D = G.at(2026, 11, 25, 23, 57), N2 = G.at(2026, 11, 27, 0, 0, 30), d0 = G.key(D), d1 = G.key(D + 86400000), d2 = G.key(N2);
  const t = await G.startAt(D, ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await G.shot(t, 'L1'); await G.shot(t, 'A'); await G.finish(t);   // 23:57: a box goes in as usual
    if (G.rowsWith(ctl, 'TBA111111111111').length !== 1) fail('first box not sent');
    await t.page.clock.fastForward('04:00');                           // the phone sleeps through midnight: due timers fire once
    await t.page.waitForTimeout(500);
    if ((await t.ev('S.day')) !== d1) fail('list still on ' + await t.ev('S.day'));
    const title = await t.page.textContent('#listTitle');
    if (title !== 'Today') fail('list title: ' + title);
    await G.shot(t, 'L2'); await G.shot(t, 'B'); await G.finish(t);   // 00:01: the next box
    const r2 = G.rowsWith(ctl, 'TBA222222222222');
    if (r2.length !== 1 || r2[0].day !== d1) fail('box after midnight not sent with its day: ' + JSON.stringify(r2));
    const cards = await t.page.$$eval('#boxes > [data-id]', els => els.length);
    if (cards !== 1) fail('cards on today’s list: ' + cards);
    // The operator picks the earlier day (say, to print a label) and keeps working: today's box still goes in.
    await t.page.selectOption('#daySel', d0);
    await G.shot(t, 'L3'); await G.shot(t, 'C'); await G.finish(t);
    const r3 = G.rowsWith(ctl, 'TBA333333333333');
    if (r3.length !== 1 || r3[0].day !== d1) fail('today’s box not sent while an earlier day is on screen: ' + JSON.stringify(r3));
    if ((await t.ev('S.day')) !== d0) fail('the picked day moved to ' + await t.ev('S.day'));
    // The next midnight: the day picked by hand stays.
    await t.page.clock.setSystemTime(N2);
    await t.page.clock.fastForward('01:05');
    await t.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await t.page.waitForTimeout(500);
    if ((await t.ev('S.day')) !== d0) fail('the picked day moved at the next midnight to ' + await t.ev('S.day'));
    const opts = await t.page.$$eval('#daySel option', els => els.map(o => o.textContent));
    if (!opts.includes(G.disp(d2) + ' (today)')) fail('day list: ' + JSON.stringify(opts));
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

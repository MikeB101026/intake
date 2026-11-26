// R27: the watch list holds JOHN SMITH (CALL FIRST). (1) A normal start loads it. (2) The next start has no watch list
// (the request is lost every time) while reads work: JOHN SMITH's card still shows "WATCH LIST: CALL FIRST" — from the list
// this phone kept — nothing goes in by itself, and the bar says names were checked against the last list this phone had
// (before: no chip at all, and the bar asked for a tap on Send, which put him in with no warning). (3) A phone that never
// loaded a list from this backend: no chip can show, and the bar says names can't be checked. (4) Back online: the fresh
// list loads, the plain box goes in by itself and JOHN SMITH waits.
const { G, L, makeBackend5, view, rowWith } = require('./lib_g5.js');
const NAME = 'r_R27_kept_watch';
const PORT = +process.env.PORT || 10660;
(async () => {
  const ctl = { watchNames: ['JOHN SMITH (CALL FIRST)'] };
  const t = await G.start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: makeBackend5(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const bar = () => t.ev(`(e => e && !e.hidden ? e.textContent : '')(document.querySelector('#watchMsg'))`);
  const card = id => t.ev(`(e => e ? e.textContent : '')(document.querySelector('[data-id="${id}"]'))`);
  try {
    await L.waitFor(t, 'PACE.ready || PACE.off', 15000); await G.idle(t);
    if (!(await t.ev('!!S.watch && S.watch.length === 1'))) throw new Error('setup: the list didn’t load');
    // (2)
    ctl.watchDown = true;
    await G.seed(t, [
      G.readyBox({ id: 'w1', seq: 1 }),                                                     // JOHN SMITH
      G.readyBox({ id: 'w2', seq: 2, row: { customer: 'MARY JONES', tracking: 'TBA222222222222', weight: '7' }, _shapes: ['L2', 'B'] }),
    ]);
    await L.waitFor(t, '!!S.watchFailed', 10000).catch(() => {});
    await t.page.waitForTimeout(500); await G.idle(t);
    if (await t.ev('!!S.watch')) throw new Error('setup: the list loaded');
    if (!/WATCH LIST: CALL FIRST/.test(await card('w1'))) fail('(2) no WATCH LIST chip on JOHN SMITH’s card: ' + JSON.stringify(await card('w1')));
    if (rowWith(ctl, 'TBA111111111111').length || rowWith(ctl, 'TBA222222222222').length) fail('(2) a box went in by itself');
    const m2 = await bar();
    if (m2 !== 'Watch list not loaded — names checked against the last one this phone had. Boxes wait for you to tap Send') fail('(2) bar: ' + JSON.stringify(m2));
    // (3) the kept list gone (a phone that never loaded one from this backend)
    await t.page.evaluate(() => localStorage.removeItem('watchNames:https://backend.test/exec'));
    await G.reload(t);
    await L.waitFor(t, '!!S.watchFailed', 10000).catch(() => {});
    await t.page.waitForTimeout(500); await G.idle(t);
    if (/WATCH LIST/.test(await card('w1'))) fail('(3) a chip from no list');
    const m3 = await bar();
    if (m3 !== 'Watch list not loaded — names can’t be checked: check them before you tap Send') fail('(3) bar: ' + JSON.stringify(m3));
    if (rowWith(ctl, 'TBA111111111111').length || rowWith(ctl, 'TBA222222222222').length) fail('(3) a box went in by itself');
    // (4)
    ctl.watchDown = false;
    await t.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await L.waitFor(t, `!!S.boxes.get('w2').sheetRow`, 15000).catch(() => fail('(4) the plain box didn’t go in once the list loaded'));
    await G.idle(t);
    if ((await view(t, 'w1')).sheetRow || rowWith(ctl, 'TBA111111111111').length) fail('(4) JOHN SMITH went in');
    if (!/WATCH LIST: CALL FIRST/.test(await card('w1'))) fail('(4) no chip');
    if (await bar()) fail('(4) the bar still says the list isn’t loaded');
    if (await t.page.evaluate(() => localStorage.getItem('watchNames:https://backend.test/exec')) !== JSON.stringify(['JOHN SMITH (CALL FIRST)'])) fail('(4) the fresh list wasn’t kept');
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

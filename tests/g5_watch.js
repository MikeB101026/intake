// F28: nothing goes into the sheet on its own before the watch list has loaded. (1) The app starts with no signal for
// the watch list: a watch-listed box and a plain one both wait, and the bar says why. (2) Back online: the list loads,
// the plain box goes by itself, the watch-listed one keeps waiting with its warning. (3) Reopened with a slow answer:
// the waiting watch-listed box is not sent before the list arrives (before, start-up sent it at once).
const { G, L, begin5, view, rowWith } = require('./lib_g5.js');
(async () => {
  const ctl = { watchDown: true, watchNames: ['JOHN SMITH (CALL FIRST)'] };
  const t = await begin5(ctl);
  let ok = true, why = '';
  const fail = s => { ok = false; why += ' ' + s; };
  try {
    await G.seed(t, [
      G.readyBox({ id: 'w1', seq: 1 }),                                                          // JOHN SMITH: on the watch list
      G.readyBox({ id: 'w2', seq: 2, row: { customer: 'MARY JONES', tracking: 'TBA222222222222', weight: '7' }, _shapes: ['L2', 'B'] }),
    ]);
    await t.page.waitForTimeout(1200);
    await G.idle(t);
    // (1)
    if (rowWith(ctl, 'TBA111111111111').length) fail('(1) the watch-listed box went in while the list was unknown;');
    if (rowWith(ctl, 'TBA222222222222').length) fail('(1) a box went in by itself while the watch list was unknown;');
    const msg = await t.ev(`(e => e && !e.hidden ? e.textContent : '')(document.querySelector('#watchMsg'))`);
    if (!/Watch list not loaded/.test(msg || '')) fail('(1) the bar doesn’t say why the boxes wait: ' + JSON.stringify(msg) + ';');
    // (2)
    ctl.watchDown = false;
    await t.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await L.waitFor(t, `!!S.boxes.get('w2').sheetRow`, 15000).catch(() => fail('(2) the plain box didn’t go in once the list loaded;'));
    await G.idle(t);
    const w1 = await view(t, 'w1');
    if (w1.sheetRow || rowWith(ctl, 'TBA111111111111').length) fail('(2) the watch-listed box went in: ' + JSON.stringify(w1) + ';');
    const card = await t.ev(`document.querySelector('[data-id="w1"]').textContent`);
    if (!/WATCH LIST: CALL FIRST/.test(card)) fail('(2) no watch-list chip on its card;');
    if (await t.ev(`(e => !!e && !e.hidden)(document.querySelector('#watchMsg'))`)) fail('(2) the bar still says the list isn’t loaded;');
    // (3)
    ctl.watchMs = 900;
    await G.reload(t);
    await t.page.waitForTimeout(1500);
    await G.idle(t);
    if (rowWith(ctl, 'TBA111111111111').length) fail('(3) start-up sent the waiting watch-listed box before its list arrived;');
    // (4) A watch request that is never answered (weak signal): once it is 30 s old the next try says so and asks again.
    if (ok) {
      ctl.watchHang = true;
      await G.reload(t);
      await t.page.waitForTimeout(500);
      const calls0 = ctl.watchCalls;
      if (await t.ev('!!S.watch')) fail('(4) setup: the list loaded;');
      ctl.watchHang = false;
      await t.ev('(() => { watchAt -= 31000; watchAgain(); return 1; })()');   // the 30-s retry, 30 s into the hung request
      if (!(await t.ev('!!S.watchFailed'))) fail('(4) a hung request isn’t said;');
      await L.waitFor(t, '!!S.watch', 10000).catch(() => fail('(4) a hung request is waited for forever;'));
      if (ctl.watchCalls <= calls0) fail('(4) not asked again;');
      await G.idle(t);
      if (rowWith(ctl, 'TBA111111111111').length) fail('(4) the watch-listed box went in;');
    }
    if (G.pageErrors(t).length) fail('page errors: ' + G.pageErrors(t).join(' | '));
  } catch (e) { fail(e.message); }
  finally { await t.close(); }
  L.report('g5_watch', ok, why);
})();

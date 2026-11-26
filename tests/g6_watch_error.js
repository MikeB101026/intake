// F27 (app + backend v10): the watch list block (named WATCH_LIST) has no names — rows inserted or deleted around it by
// hand left it empty. Backend v10 answers "watch" with an error instead of an empty list: the app says so in red at
// start-up (once — not again on every retry), boxes don't go in by themselves meanwhile, and once the office fixes the
// list the next retry loads it and the waiting box goes. The backend is this repo's backend/Code.gs run in node; the app
// is REPO's. (v37: the error was swallowed — nothing on screen — and the boxes went in without their watch check.)
const { start } = require('./h.js');
const G = require('./lib_g4.js'), L = G.L, G6 = require('./lib_g6.js');
const NAME = 'g6_watch_error';
(async () => {
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const day = G6.today();
  const be = G6.loadBackend({ file: require('path').resolve(__dirname, '..', 'backend', 'Code.gs'), props: { NEXT_ROW: '100', LAST_SEP: JSON.stringify({ row: 99, day }), WATCH_RANGE: 'B9070:B9110' } });
  G6.sepRow(be.sh, 99, day);
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: G6.harnessBackend(be, ctl) });
  const noticeText = () => t.ev('document.querySelector("#notice").hidden ? "" : document.querySelector("#notice").textContent');
  try {
    await L.waitFor(t, 'PACE.ready || PACE.off', 15000); await G.idle(t);
    await G.setLs(t, { nextRowSeen: '100' });
    await G.seed(t, [G.readyBox({ id: 'r1', seq: 1, row: { customer: 'MARY JONES', tracking: 'TBA222222222222', weight: '7' } })]);
    await t.page.waitForTimeout(500); await G.idle(t);
    const n1 = await noticeText();
    if (!/Watch list not loaded: .*WATCH_LIST/.test(n1)) fail('no red notice for the empty watch list: ' + JSON.stringify(n1));
    if (be.sh.findRows(c => c[1] === 'TBA222222222222').length) fail('a box went in by itself while the watch list was missing');
    // Dismissed, then the 30-s retry fails the same way: not said again.
    await t.ev('notice(null)');
    const calls0 = ctl.ops.filter(o => o === 'watch').length;
    await t.ev('(() => { watchAt -= 31000; watchAgain(); return 1; })()'); await t.page.waitForTimeout(300);
    if (ctl.ops.filter(o => o === 'watch').length <= calls0) fail('not asked again');
    if (await noticeText()) fail('said again on the retry: ' + await noticeText());
    // The office puts the names back: the next retry loads the list and the waiting box goes in.
    be.sh.set(9070, 2, 'JOHN SMITH (OWES MONEY)');
    await t.ev('(() => { watchAt -= 31000; watchAgain(); return 1; })()');
    await L.waitFor(t, '!!S.watch && S.watch.length === 1', 10000).catch(() => fail('the fixed list didn’t load'));
    await L.waitFor(t, '!!S.boxes.get("r1").sheetRow', 10000).catch(() => fail('the waiting box didn’t go in once the list loaded'));
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.stack || e.message).split('\n').slice(0, 3).join(' ')); }
  finally { await t.close(); }
  G6.report(NAME, ok, why);
})();

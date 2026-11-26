// F12 + R4 (box left unfinished at the end of the shift, app started again the next morning): at start-up the old box is
// finished — read, never shown as in progress — and the operator is told which box and day and what to do. Nobody tapped
// Finish, so it may be half shot: it waits on Check ("Left in progress on …"), nothing goes in by itself, and the bar
// points at that day. There, Looks good and Send put it in with its own date. The first photo starts a new box of the
// new day. (v37: the old box stayed "in progress", was silently replaced by the first photo and stayed Not read on its
// day forever. Before R4, v38 sent it by itself, half shot or not.)
const G = require('./lib_g3.js'), L = G.L;
const NAME = 'g3_overnight_boot';
// The held box: the bar opens its day, Looks good on its card, then Send. '' when it went in, else what went wrong.
async function sendHeld(t, id, when) {
  const bar = (await t.page.textContent('#sendBtn')).trim();
  if (bar !== `1 box of ${when} not in the sheet — tap to open that day`) return 'bar: ' + bar;
  await t.page.click('#sendBtn'); await t.page.waitForTimeout(300); await L.waitIdle(t, 30000);
  if (!(await t.ev(`S.expanded.has(${JSON.stringify(id)})`))) await t.page.click(`[data-id="${id}"] [data-act="toggle"]`);
  await t.page.click(`[data-id="${id}"] [data-act="ok"]`);
  await t.page.waitForTimeout(300);
  const bar2 = (await t.page.textContent('#sendBtn')).trim();
  if (bar2 !== 'Send 1 to sheet') return 'bar after Looks good: ' + bar2;
  await t.page.click('#sendBtn');
  await L.waitFor(t, `!!S.boxes.get(${JSON.stringify(id)}).sheetRow`, 20000).catch(() => {});
  await L.waitIdle(t, 30000);
  return '';
}
(async () => {
  const ctl = {};
  const D = G.at(2026, 11, 25, 17, 50), M = G.at(2026, 11, 26, 8, 5), d0 = G.key(D), d1 = G.key(M);
  const t = await G.startAt(D, ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await G.shot(t, 'L1'); await G.shot(t, 'A');                   // label + contents, no "Finish this box"
    const old = await t.ev('S.current'), q = JSON.stringify(old);
    await t.page.clock.setSystemTime(M);                          // next morning, the app is opened again
    await G.reload(t);
    const note = await G.noticeText(t);
    if (!/^Box #1 of 25 NOV 2026 was left in progress\. It is being read now — open 25 NOV 2026 \(button at the bottom or the day list\), check it, then tap “Looks good” and Send\. It goes in with that date\./.test(note)) fail('notice: ' + note);
    if (await t.ev('S.current === ' + q)) fail('the old box is still the box in progress');
    if (!(await t.ev('document.querySelector("#curBar").hidden'))) fail('the morning screen shows a box in progress: ' + await t.page.textContent('#curText'));
    await L.waitIdle(t, 30000); await t.page.waitForTimeout(1000); await L.waitIdle(t, 30000);
    let bx = await G.boxes(t);
    const o = bx.find(b => b.id === old);
    if (!o || o.status !== 'read' || o.view !== 'check' || o.sheetRow || o.day !== d0 || o.customer !== 'JOHN SMITH' || !/ALPHA SHOE/.test(o.contents)) fail('old box (read, waiting on Check): ' + JSON.stringify(o));
    const rs = await t.ev(`reasons(S.boxes.get(${q}))`);
    if (!rs.includes('Left in progress on 25 NOV 2026 — check it has its label and all its contents (+ Camera), then tap “Looks good”.')) fail('reasons: ' + JSON.stringify(rs));
    if (ctl.appends || G.rowsWith(ctl, 'TBA111111111111').length) fail('went into the sheet by itself: ' + JSON.stringify(ctl.sheet.rows));
    const sent = await sendHeld(t, old, '25 NOV');
    if (sent) fail(sent);
    const rows = G.rowsWith(ctl, 'TBA111111111111');
    if (rows.length !== 1 || rows[0].day !== d0 || !/ALPHA SHOE/.test(rows[0].cells[6])) fail('sheet: ' + JSON.stringify(rows));
    await G.shot(t, 'L2');                                         // the first package of the day
    bx = await G.boxes(t);
    const cur = bx.find(b => b.cur);
    if (!cur || cur.id === old || cur.day !== d1 || cur.seq !== 1 || cur.n !== 1) fail('new box: ' + JSON.stringify(bx));
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

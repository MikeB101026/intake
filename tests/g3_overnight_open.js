// F12 + R4 with the app left open overnight (never reloaded). 1) The first photo of the morning finishes the box left in
// progress the evening before (read, the operator told which box and day and what to do) and starts a new box of the new
// day. 2) When the app comes back on screen the next morning, a box left in progress is finished before any photo, so the
// screen never offers it as "this same box". Nobody tapped Finish on either, so each waits on Check and nothing goes in
// by itself; the bar points at its day, where Looks good and Send put it in with its own date. A box finished by a tap
// still goes in by itself. (v37: the first photo silently replaced the old box, which stayed Not read on its day forever;
// the morning screen still showed it as in progress. Before R4, v38 sent such a box by itself, half shot or not.)
const G = require('./lib_g3.js'), L = G.L;
const NAME = 'g3_overnight_open';
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
const held = async (t, id, day) => {
  const b = (await G.boxes(t)).find(x => x.id === id), rs = await t.ev(`reasons(S.boxes.get(${JSON.stringify(id)}))`);
  return b && b.status === 'read' && b.view === 'check' && !b.sheetRow && rs.includes(`Left in progress on ${G.disp(day)} — check it has its label and all its contents (+ Camera), then tap “Looks good”.`) ? '' : JSON.stringify({ b, rs });
};
(async () => {
  const ctl = {};
  const D = G.at(2026, 11, 25, 17, 50), M = G.at(2026, 11, 26, 8, 5), E = G.at(2026, 11, 26, 17, 40), M2 = G.at(2026, 11, 27, 7, 55);
  const d0 = G.key(D), d1 = G.key(M);
  const t = await G.startAt(D, ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    // 1) evening: label + contents, no Finish. Next morning (no timer has run): the first photo.
    await G.shot(t, 'L1'); await G.shot(t, 'A');
    const old = await t.ev('S.current');
    await t.page.clock.setSystemTime(M);
    await G.shot(t, 'L2');
    const note = await G.noticeText(t);
    if (!/^Box #1 of 25 NOV 2026 was left in progress\. It is being read now — open 25 NOV 2026 \(button at the bottom or the day list\), check it, then tap “Looks good” and Send\. It goes in with that date\./.test(note)) fail('notice: ' + note);
    let bx = await G.boxes(t);
    const cur = bx.find(b => b.cur);
    if (!cur || cur.id === old || cur.day !== d1 || cur.seq !== 1 || cur.n !== 1) fail('the morning photo: ' + JSON.stringify(bx));
    if ((await t.ev('S.day')) !== d1) fail('list not on the new today: ' + await t.ev('S.day'));
    await L.waitIdle(t, 30000);
    const h1 = await held(t, old, d0);
    if (h1) fail('old box not waiting on Check: ' + h1);
    if (G.rowsWith(ctl, 'TBA111111111111').length) fail('old box went in by itself: ' + JSON.stringify(G.rowsWith(ctl, 'TBA111111111111')));
    await G.shot(t, 'B'); await G.finish(t);                       // the morning box goes in as usual
    const r2 = G.rowsWith(ctl, 'TBA222222222222');
    if (r2.length !== 1 || r2[0].day !== d1) fail('sheet (morning box): ' + JSON.stringify(r2));
    const s1 = await sendHeld(t, old, '25 NOV');
    if (s1) fail('old box: ' + s1);
    const r1 = G.rowsWith(ctl, 'TBA111111111111');
    if (r1.length !== 1 || r1[0].day !== d0 || !/ALPHA SHOE/.test(r1[0].cells[6])) fail('sheet (old box): ' + JSON.stringify(r1));
    // 2) that evening another box is left in progress; the next morning the app comes back on screen.
    await t.page.clock.setSystemTime(E);
    await G.shot(t, 'L3'); await G.shot(t, 'C');
    const left = await t.ev('S.current');
    await t.page.clock.setSystemTime(M2);
    await t.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await t.page.waitForTimeout(300);
    const note2 = await G.noticeText(t);
    if (!/^Box #2 of 26 NOV 2026 was left in progress\. It is being read now — open 26 NOV 2026 /.test(note2)) fail('notice on coming back: ' + note2);
    if (await t.ev('S.current === ' + JSON.stringify(left))) fail('still the box in progress after coming back on screen');
    if (!(await t.ev('document.querySelector("#curBar").hidden'))) fail('screen offers the old box: ' + await t.page.textContent('#curText'));
    await L.waitIdle(t, 30000);
    const h2 = await held(t, left, d1);
    if (h2) fail('left box not waiting on Check: ' + h2);
    if (G.rowsWith(ctl, 'TBA333333333333').length) fail('left box went in by itself');
    const s2 = await sendHeld(t, left, '26 NOV');
    if (s2) fail('left box: ' + s2);
    const r3 = G.rowsWith(ctl, 'TBA333333333333');
    if (r3.length !== 1 || r3[0].day !== d1 || !/CHARLIE LAMP/.test(r3[0].cells[6])) fail('sheet (left box): ' + JSON.stringify(r3));
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

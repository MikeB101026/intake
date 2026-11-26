// F12 (midnight form): a package shot across midnight stays ONE box, dated the day it was started, and goes into the
// sheet whole (label + contents) with that date; the list follows the clock to the new today. (v37: the contents photo
// after midnight started a new box #1 of the new day — read without a label — and the label box was never read.)
const G = require('./lib_g3.js'), L = G.L;
const NAME = 'g3_midnight_one_box';
(async () => {
  const ctl = {};
  const D = G.at(2026, 11, 25, 23, 59, 0), D1 = G.at(2026, 11, 26, 0, 0, 40), d0 = G.key(D), d1 = G.key(D1);
  const t = await G.startAt(D, ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await G.shot(t, 'L1');                                         // 23:59: the label
    const first = await t.ev('S.current');
    await t.page.clock.setSystemTime(D1);                         // 00:00:40 (no timer has noticed the new day yet)
    await G.shot(t, 'A');                                          // the contents
    let bx = await G.boxes(t);
    if (bx.length !== 1) fail('boxes after the contents photo: ' + JSON.stringify(bx.map(b => `#${b.seq} ${b.day} ${b.n} photos`)));
    if ((await t.ev('S.current')) !== first) fail('the contents photo started another box');
    if (!bx[0] || bx[0].day !== d0 || bx[0].n !== 2) fail('box: ' + JSON.stringify(bx[0]));
    if ((await t.ev('S.day')) !== d1) fail('list still on ' + (await t.ev('S.day')) + ' (it was on today, so it follows the clock)');
    const bar = await t.page.textContent('#curText');
    if (!/^Box #1 of 25 NOV 2026 in progress — 1 label, 1 other photo/.test(bar)) fail('in-progress bar: ' + bar);
    await G.finish(t);
    bx = await G.boxes(t);
    const rows = G.rowsWith(ctl, 'TBA111111111111');
    if (rows.length !== 1 || rows[0].day !== d0 || !/ALPHA SHOE/.test(rows[0].cells[6])) fail('sheet rows: ' + JSON.stringify(rows));
    if (!bx[0] || !bx[0].sheetRow || bx[0].customer !== 'JOHN SMITH') fail('after Finish: ' + JSON.stringify(bx));
    const msg = await t.page.textContent('#barMsg');
    if (!/#1 of 25 NOV 2026/.test(msg)) fail('the send names the box without its day: ' + msg);
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

// R4: a box left half shot at the end of the shift — only its label, no "Finish this box" — and the app opened again the
// next morning. The app finishes it (it is read), but nobody tapped Finish: it waits on Check ("Left in progress on
// 25 NOV 2026 — …") and nothing goes into the sheet by itself, so the red notice is still there seconds later (before:
// row 100 went in with empty contents, a ✓ notice covered the red one and cleared itself 6 s later). The operator opens
// that day, taps Looks good, adds the contents with + Camera on its card; that re-read asks again; Looks good + Send: one
// complete row with its own date. The same for a night-shift break of more than 2 h past midnight (back on screen).
const { start } = require('./h.js');
const G = require('./lib_g3.js'), L = G.L, G2 = require('./lib_g2.js');
const NAME = 'r_R4_left_open';
const PORT = +process.env.PORT || 10600;
(async () => {
  const ctl = {};
  const D = G.at(2026, 11, 25, 17, 58), M = G.at(2026, 11, 26, 8, 0), N = G.at(2026, 11, 26, 23, 30), W = G.at(2026, 11, 27, 1, 31);
  const d0 = G.key(D), d1 = G.key(M);
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: G.makeBackend3(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const LEFT = day => `Left in progress on ${G.disp(day)} — check it has its label and all its contents (+ Camera), then tap “Looks good”.`;
  const state = async id => {
    const b = (await G.boxes(t)).find(x => x.id === id);
    return Object.assign({}, b, { reasons: await t.ev(`reasons(S.boxes.get(${JSON.stringify(id)}))`) });
  };
  const settle = async () => { await L.waitIdle(t, 30000); await t.page.clock.runFor(8000); await t.page.waitForTimeout(500); await L.waitIdle(t, 30000); };   // past the 6-s ✓ clear
  try {
    await t.page.clock.install({ time: D }); await G.reload(t);
    // 1) the label only, then the shift ends. Next morning the app is opened again.
    await G.shot(t, 'L1');
    const id = await t.ev('S.current');
    await t.page.clock.setSystemTime(M);
    await G.reload(t);
    await settle();
    const note = await G.noticeText(t);
    if (!/^Box #1 of 25 NOV 2026 was left in progress\. It is being read now — open 25 NOV 2026 \(button at the bottom or the day list\), check it, then tap “Looks good” and Send\. It goes in with that date\./.test(note)) fail('notice after 8 s: ' + JSON.stringify(note));
    if (ctl.appends || ctl.sheet.rows.length) fail('went into the sheet by itself: ' + JSON.stringify(ctl.sheet.rows));
    let b = await state(id);
    if (b.status !== 'read' || b.view !== 'check' || b.sheetRow || !b.reasons.includes(LEFT(d0))) fail('not waiting on Check: ' + JSON.stringify(b));
    const bar = (await t.page.textContent('#sendBtn')).trim();
    if (bar !== '1 box of 25 NOV not in the sheet — tap to open that day') fail('bar: ' + bar);
    // 2) the operator opens that day (day list) and checks the box: Looks good, then the contents with + Camera
    await t.page.selectOption('#daySel', d0); await t.page.waitForTimeout(300); await L.waitIdle(t, 30000);
    await G2.expand(t, id);
    if (await t.ev(`!!document.querySelector('[data-id="${id}"] [data-act="ok"]')`)) {
      await t.page.click(`[data-id="${id}"] [data-act="ok"]`); await t.page.waitForTimeout(200);
      if ((await state(id)).view !== 'ready') fail('Looks good didn’t make it Ready');
    }
    await G2.camOnCard(t, id, 1);
    await t.page.click('#camDone');
    await t.page.waitForTimeout(400); await settle();
    b = await state(id);
    if (b.sheetRow || ctl.sheet.rows.length) fail('went in by itself after + Camera: ' + JSON.stringify(ctl.sheet.rows));
    else if (b.view !== 'check' || !b.reasons.includes(LEFT(d0)) || !/CAMERA ITEM/.test(b.contents || '')) fail('the re-read doesn’t ask again: ' + JSON.stringify(b));
    if (await t.ev(`!!document.querySelector('[data-id="${id}"] [data-act="ok"]')`)) {
      await t.page.click(`[data-id="${id}"] [data-act="ok"]`); await t.page.waitForTimeout(300);
      if ((await t.page.textContent('#sendBtn')).trim() === 'Send 1 to sheet') { await t.page.click('#sendBtn'); await L.waitFor(t, `!!S.boxes.get(${JSON.stringify(id)}).sheetRow`, 20000).catch(() => {}); }
      await L.waitIdle(t, 30000);
    }
    const rows = G.rowsWith(ctl, 'TBA111111111111');
    if (rows.length !== 1 || rows[0].day !== d0 || !/CAMERA ITEM/.test(rows[0].cells[6])) fail('after Looks good + Send: ' + JSON.stringify(rows));
    // 3) night shift: a label at 23:30, the phone asleep, back on screen at 01:31 (more than 2 h): finished, held too
    await t.page.clock.setSystemTime(N);
    await G.shot(t, 'L2');
    const id2 = await t.ev('S.current');
    const n0 = ctl.sheet.rows.length;
    await t.page.clock.setSystemTime(W);
    await t.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await t.page.waitForTimeout(300); await settle();
    const note2 = await G.noticeText(t);
    if (!/^Box #1 of 26 NOV 2026 was left in progress\. It is being read now — open 26 NOV 2026 /.test(note2)) fail('night-shift notice: ' + JSON.stringify(note2));
    const b2 = await state(id2);
    if (ctl.sheet.rows.length !== n0 || b2.sheetRow) fail('night-shift box went in by itself: ' + JSON.stringify(ctl.sheet.rows.slice(n0)));
    else if (b2.view !== 'check' || b2.day !== d1 || !b2.reasons.includes(LEFT(d1))) fail('night-shift box not waiting on Check: ' + JSON.stringify(b2));
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

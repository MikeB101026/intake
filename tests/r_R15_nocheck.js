// R15: a box's row went in but the answer was lost; Send is tapped again on the same weak signal. The repeat check
// names its row, then reading the day's rows fails. (A) Only that one read fails: it is asked once more and the box is
// marked as sent at its own row. (B) Every read fails: nothing is written and no bar opens (v38's bar said "Not this
// box's own earlier send … Send all anyway", which wrote it twice) — the notice says it may already be in the sheet;
// once the sheet can be read, Send marks it as sent. (C) A first send whose tracking is an earlier day's row, rows
// can't be read: the bar opens but never claims "Not this box's own earlier send".
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'r_R15_nocheck';
const PORT = +process.env.PORT || 10004;
const holdSync = (t, on) => t.ev(on ? 'Object.defineProperty(document, "hidden", { configurable: true, get: () => true }), 1' : 'delete document.hidden, 1');   // no 30-s sync meanwhile
const plan = t => t.page.evaluate(() => { const el = document.querySelector('#plan'); return { shown: !el.hidden, text: el.textContent.replace(/\s+/g, ' '), adopt: el.querySelectorAll('[data-adopt]').length }; });
(async () => {
  let armed = false, failAll = false, last = '', failed = 0;
  const ctl = { start: 106, hook: op => {
    const prev = last; last = op;
    if (op === 'dayRows' && (failAll || (armed && prev === 'append'))) { armed = false; failed++; return 'ABORT'; }
  } };
  const t = await G.begin(ctl, { port: PORT, repo: process.env.REPO || require('path').resolve(__dirname, '..') });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const X = 'TBA111111111111', Y = 'TBA222222222222', Z = 'TBA333333333333';
    ctl.sheet.set(103, G.sheetRow(G.daysAgo(6), ['PETER PAN', Z, '1', '9', 'AMAZON', 'NO INVOICE', 'HOTEL CUP (1 TOTAL)'], [{ id: 'OLDLABELPHOTOxxxxxxxxxxxx', label: 'LABEL 1' }]));
    await G.setLs(t, { autoSend: '0', nextRowSeen: '107' });
    await G.seed(t, [G.readyBox({ id: 'x', seq: 1, row: { customer: 'JOHN SMITH', tracking: X, weight: '4' } }),
      G.readyBox({ id: 'y', seq: 2, row: { customer: 'MARY JONES', tracking: Y, weight: '7' } }),
      G.readyBox({ id: 'z', seq: 3, row: { customer: 'PETER PAN', tracking: Z, weight: '9' } })]);
    await holdSync(t, true);
    // (A)
    ctl.lose.append = 1;
    await t.ev('planSend([S.boxes.get("x")])'); await G.idle(t);
    armed = true; failed = 0;
    await t.ev('planSend([S.boxes.get("x")])'); await G.idle(t);
    let p = await plan(t);
    const x = await G.box(t, 'x');
    if (failed !== 1) fail(`(A) ${failed} reads of the day failed (setup)`);
    if (x.sheetRow !== 107 || x.view !== 'sent') fail(`(A) not marked as sent at its row 107 (row ${x.sheetRow}, ${x.view}); bar: ${p.shown ? p.text : '-'}`);
    if (p.shown) { await t.page.click('#planCancel'); await G.idle(t); }
    if (G.rowsWith(ctl, X).length !== 1) fail('(A) written ' + G.rowsWith(ctl, X).length + ' times');
    // (B)
    ctl.lose.append = 1;
    await t.ev('planSend([S.boxes.get("y")])'); await G.idle(t);
    const yr = G.rowsWith(ctl, Y)[0];
    failAll = true;
    await t.ev('planSend([S.boxes.get("y")])'); await G.idle(t);
    p = await plan(t);
    const n = await G.noticeText(t);
    if (p.shown) { fail('(B) the bar opened though the sheet couldn\'t be checked: ' + p.text); await t.page.click('#planAll'); await G.idle(t); }
    if (!new RegExp(`Box #2 may already be in the sheet \\(row ${yr}\\), but the sheet couldn’t be checked\\. Nothing was written`).test(n)) fail('(B) notice: ' + n);
    if (G.rowsWith(ctl, Y).length !== 1) fail('(B) written ' + G.rowsWith(ctl, Y).length + ' times');
    failAll = false;
    await t.ev('planSend([S.boxes.get("y")])'); await G.idle(t);
    const y = await G.box(t, 'y');
    if (y.sheetRow !== yr || y.view !== 'sent') fail(`(B) once the sheet could be read: row ${y.sheetRow}, ${y.view}`);
    if (G.rowsWith(ctl, Y).length !== 1) fail('(B) written ' + G.rowsWith(ctl, Y).length + ' times in the end');
    // (C)
    failAll = true;
    await t.ev('planSend([S.boxes.get("z")])'); await G.idle(t);
    p = await plan(t);
    if (!p.shown) fail('(C) no bar for a first send: ' + await G.noticeText(t));
    else {
      if (/own earlier send/.test(p.text)) fail('(C) the bar claims a row it couldn\'t check: ' + p.text);
      if (!/Couldn’t check the sheet just now/.test(p.text)) fail('(C) the bar doesn\'t say the sheet couldn\'t be checked: ' + p.text);
      await t.page.click('#planCancel'); await G.idle(t);
    }
    failAll = false;
    if (G.rowsWith(ctl, Z).length !== 1) fail('(C) written ' + G.rowsWith(ctl, Z).length + ' times');
    await holdSync(t, false);
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

// R3: a box's row goes in but the answer is lost. (A) Before this phone looks again, a row above is deleted in the
// sheet, so its row is now above where the sheet ended at its first try: Send again must still offer "mark as sent"
// for it (an exact match of what it sent). (B) The office fixes the customer's spelling in the row before the next
// sync: the sync must not bring that row back as a second card (v38 did; the box then had no "mark as sent", "Send all
// anyway" wrote it twice, "Keep one" deleted the only copy of its photos); Send offers "mark as sent", its photos go
// to that row and the next sync takes the office's fix over. (C) A box whose lost send was tried before v38 (its try
// has no cells): no second card either, and "mark as sent" is offered. Nothing is written twice.
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'r_R3_lost_edit';
const PORT = +process.env.PORT || 10002;
// The 30-s sync can't run while document.hidden says so (a phone with the app in the background): (A) needs the Send
// before any sync.
const holdSync = (t, on) => t.ev(on ? 'Object.defineProperty(document, "hidden", { configurable: true, get: () => true }), 1' : 'delete document.hidden, 1');
const plan = t => t.page.evaluate(() => { const el = document.querySelector('#plan'); return { shown: !el.hidden, text: el.textContent.replace(/\s+/g, ' '), adopt: el.querySelectorAll('[data-adopt]').length }; });
(async () => {
  const ctl = { start: 106 };
  const t = await G.begin(ctl, { port: PORT, repo: process.env.REPO || require('path').resolve(__dirname, '..') });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const X = 'TBA111111111111', Y = 'TBA222222222222', Z = 'TBA333333333333';
    await G.setLs(t, { autoSend: '0', nextRowSeen: '107' });
    await G.seed(t, [G.readyBox({ id: 'y', seq: 1, row: { customer: 'MARY JONES', tracking: Y, weight: '7' } }),
      G.readyBox({ id: 'x', seq: 2, row: { customer: 'JOHN SMTIH', tracking: X, weight: '4' } })]);
    // (A) MARY's row goes in at 107, the answer is lost; a row above is deleted (107 -> 106); Send again
    ctl.lose.append = 1;
    await t.ev('planSend([S.boxes.get("y")])'); await G.idle(t);
    if (JSON.stringify(G.rowsWith(ctl, Y)) !== '[107]') throw new Error('setup: MARY at ' + JSON.stringify(G.rowsWith(ctl, Y)));
    await holdSync(t, true);
    G.deleteRow(ctl, 100);
    await t.ev('planSend([S.boxes.get("y")])'); await G.idle(t);
    let p = await plan(t);
    if (!p.shown || !p.adopt) fail('(A) its own row moved up by a deleted row: no "mark as sent": ' + (p.shown ? p.text : await G.noticeText(t)));
    else { await t.page.click('#plan [data-adopt]'); await G.idle(t); }
    await holdSync(t, false);
    await t.ev('syncDay()'); await G.idle(t);
    const y = await G.box(t, 'y');
    if (y.sheetRow !== 106 || y.view !== 'sent') fail(`(A) MARY at row ${y.sheetRow} (${y.view})`);
    if (G.rowsWith(ctl, Y).length !== 1) fail('(A) MARY written ' + G.rowsWith(ctl, Y).length + ' times');
    // (B) JOHN's row goes in at 107, the answer is lost; the office fixes the spelling; the sync runs first
    ctl.lose.append = 1;
    await t.ev('planSend([S.boxes.get("x")])'); await G.idle(t);
    const row = G.rowsWith(ctl, X)[0];
    if (row !== 107) throw new Error('setup: JOHN at ' + row);
    ctl.sheet.get(row).cells[0] = 'JOHN SMITH';
    await t.ev('syncDay()'); await G.idle(t);
    let cards = await G.boxes(t);
    if (cards.some(b => b.imported)) fail('(B) the row came back as a second card: ' + cards.filter(b => b.imported).map(b => `#${b.seq} ${b.customer} row ${b.sheetRow}`).join(', '));
    // the operator taps Send on JOHN's card
    await G.G2.expand(t, 'x');
    await t.page.click('[data-id="x"] [data-act="send1"]'); await G.idle(t);
    p = await plan(t);
    if (!p.shown || !p.adopt) fail('(B) no "mark as sent" for its own row: ' + (p.shown ? p.text : await G.noticeText(t)));
    else { await t.page.click('#plan [data-adopt]'); await G.idle(t); }
    await t.ev('syncDay()'); await G.idle(t);
    const x = await G.box(t, 'x');
    if (x.sheetRow !== row || x.view !== 'sent' || x.row.customer !== 'JOHN SMITH') fail(`(B) JOHN: row ${x.sheetRow}, ${x.view}, ${x.row.customer}`);
    if (G.rowsWith(ctl, X).length !== 1) fail('(B) JOHN written ' + G.rowsWith(ctl, X).length + ' times');
    if (!ctl.uploads.some(u => u.row === row && u.n === 2) || !x.linked) fail('(B) its photos not saved to row ' + row + ': ' + JSON.stringify(ctl.uploads));
    if (ctl.sheet.get(row).cells[0] !== 'JOHN SMITH') fail('(B) the office\'s fix was written back: ' + ctl.sheet.get(row).cells[0]);
    // (C) a box sent before this version: its row went in, the answer was lost, its try has no cells
    const zr = 108;
    ctl.sheet.set(zr, G.sheetRow(G.today(), ['PETER PAN', Z, '1', '9', 'AMAZON', 'NO INVOICE', 'CHARLIE LAMP (1 TOTAL)'], []));
    await t.ev(`saveBox(Object.assign(structuredClone(S.boxes.get("y")), { id: "z", seq: 3, row: { customer: "PETER PAN", tracking: "${Z}", pieces: 1, weight: "9", shipper: "AMAZON", invoice: false, contents: "CHARLIE LAMP (1 TOTAL)" },
      status: "read", ok: true, sheetRow: null, sentCells: null, sentAt: null, wrongRow: false, photosLinked: false, photos: [], edited: {}, sendTry: { at: Date.now() - 60000, from: ${zr} } })).then(() => 1)`);
    await t.ev('syncDay()'); await G.idle(t);
    cards = await G.boxes(t);
    if (cards.some(b => b.imported)) fail('(C) a send tried before v38 came back as a second card');
    await t.ev('planSend([S.boxes.get("z")])'); await G.idle(t);
    p = await plan(t);
    if (!p.shown || !p.adopt) fail('(C) no "mark as sent": ' + (p.shown ? p.text : await G.noticeText(t)));
    else { await t.page.click('#plan [data-adopt]'); await G.idle(t); }
    const z = await G.box(t, 'z');
    if (z.sheetRow !== zr) fail(`(C) PETER at row ${z.sheetRow}`);
    if (G.rowsWith(ctl, Z).length !== 1) fail('(C) PETER written ' + G.rowsWith(ctl, Z).length + ' times');
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

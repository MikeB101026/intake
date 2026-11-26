// R20: backend v9 (live) returns only the last 500 rows. A box of 6 days ago is at row 1200, the sheet ends at 2000.
// The operator opens that day, fixes the weight on the card and taps Update: the row is still not written blind (F16),
// but the card offers "Done in the sheet" and the notice says to type the fix in there and tap it. Tapped once the
// office has typed it: the card is "In sheet" again (v38 left it "Changed" for good), with nothing written by the app.
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'r_R20_done_in_sheet';
const PORT = +process.env.PORT || 10006;
(async () => {
  const ctl = { start: 2000 };
  const t = await G.begin(ctl, { port: PORT, repo: process.env.REPO || require('path').resolve(__dirname, '..') });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const day = G.daysAgo(6);
    const x = G.G2.sentBox({ id: 'x', seq: 3, day, sheetRow: 1200, sentAt: Date.now() - 6 * 86400000, createdAt: Date.now() - 6 * 86400000, photosLinked: true,
      row: { customer: 'KAY MOSS', tracking: 'TBA444444444444', weight: '30', contents: 'DELTA MUG (1 TOTAL)' } });
    ctl.sheet.set(1200, G.sheetRow(day, x.sentCells.slice(0, 7), []));
    await G.setLs(t, { autoSend: '0', nextRowSeen: '2001' });
    await G.seed(t, [x]);
    await t.page.selectOption('#daySel', day); await G.idle(t);
    await G.G2.expand(t, 'x');
    await t.page.fill('#wt-x', '31'); await t.page.press('#wt-x', 'Tab'); await G.idle(t);
    if ((await G.box(t, 'x')).view !== 'dirty') throw new Error('setup: the card isn\'t "Changed"');
    if (await t.page.$('[data-id="x"] [data-act="updok"]')) fail('"Done in the sheet" offered before any Update');
    await t.page.click('[data-id="x"] [data-act="upd"]'); await G.idle(t);
    const n = await G.noticeText(t);
    if (ctl.sheet.get(1200).cells[3] !== '30' || ctl.writes.some(w => w.op === 'update')) fail('row 1200 written blind: ' + JSON.stringify(ctl.writes));
    if (!/Couldn’t find row 1200 .*type it into the sheet, then tap “Done in the sheet” on the card\./.test(n)) fail('notice: ' + n);
    const done = await t.page.$('[data-id="x"] [data-act="updok"]');
    if (!done) fail('no "Done in the sheet" on the card');
    else {
      ctl.sheet.get(1200).cells[3] = '31';             // the office types it in
      await done.click(); await G.idle(t);
      const b = await G.box(t, 'x');
      if (b.view !== 'sent' || b.sentCells[3] !== '31' || b.row.weight !== '31') fail(`after "Done in the sheet": ${b.view}, sent ${b.sentCells[3]}, card ${b.row.weight}`);
      if (await t.ev('!!S.boxes.get("x").updNotFound')) fail('the mark stays on the box');
      if (/Update/.test(await t.page.textContent('#sendBtn'))) fail('the bottom button still offers: ' + await t.page.textContent('#sendBtn'));
      await t.ev('syncDay()'); await G.idle(t);
      if ((await G.box(t, 'x')).view !== 'sent') fail('"Changed" again after the next sync');
    }
    if (ctl.writes.length) fail('the app wrote: ' + JSON.stringify(ctl.writes));
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

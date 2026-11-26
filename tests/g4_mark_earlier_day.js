// F9: today's box has a tracking number that is already in the sheet from an earlier day (row 103, with its photo
// links). The repeat bar must not offer "mark as sent" for that row (v37 did: today's photos then replaced row 103's
// links at once, and the box looked sent though it never went into the sheet); it names the row as an earlier day's,
// and "Send all anyway" gives the box a row of its own. Control: a box's own lost row, changed in the sheet since, is
// still offered — and marking it keeps the change made in the sheet.
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'g4_mark_earlier_day';
(async () => {
  const ctl = { start: 119 };
  const t = await G.begin(ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const T = 'TBA555555555555', T2 = 'TBA666666666666', old = [{ id: 'OLDLABELPHOTOxxxxxxxxxxxx', label: 'LABEL 1' }, { id: 'OLDINSIDEPHOTOxxxxxxxxxxx', label: 'INSIDE 1' }];
    ctl.sheet.set(103, G.sheetRow(G.daysAgo(6), ['JOHN DOE', T, '1', '6', 'AMAZON', 'NO INVOICE', 'HOTEL CUP (1 TOTAL)'], old));
    await G.setLs(t, { autoSend: '0', nextRowSeen: '120' });
    await G.seed(t, [G.readyBox({ id: 'a', seq: 1, row: { customer: 'JOHN DOE', tracking: T, weight: '5' } }),
      G.readyBox({ id: 'c', seq: 2, row: { customer: 'RITA LOPEZ', tracking: T2, weight: '9' } })]);
    await G.idle(t);
    await t.ev('planSend([S.boxes.get("a")])'); await G.idle(t);
    const bar = await t.page.evaluate(() => { const el = document.querySelector('#plan'); return { hidden: el.hidden, text: el.textContent, adopt: el.querySelectorAll('[data-adopt]').length }; });
    if (bar.hidden) fail('no repeat bar');
    if (bar.adopt) fail('"mark as sent" offered for an earlier day\'s row: ' + bar.text);
    if (!/row 103, an earlier day/.test(bar.text)) fail('the bar doesn\'t say row 103 is an earlier day\'s: ' + bar.text);
    await t.page.click('#planAll'); await G.idle(t);
    const a = await G.box(t, 'a');
    if (!(a.sheetRow > 103) || ctl.sheet.get(a.sheetRow).cells[3] !== '5') fail('"Send all anyway" didn\'t give it a row of its own: ' + a.sheetRow);
    if (JSON.stringify(ctl.sheet.get(103).pics) !== JSON.stringify(old)) fail('row 103\'s photo links replaced');
    // control: the box's own row went in but its answer was lost, and the office changed its weight before Send again
    ctl.lose.append = 1;
    await t.ev('planSend([S.boxes.get("c")])'); await G.idle(t);
    const own = G.rowsWith(ctl, T2)[0];
    ctl.sheet.get(own).cells[3] = '10';
    await t.ev('planSend([S.boxes.get("c")])'); await G.idle(t);
    const btn = await t.page.$('#plan [data-adopt]');
    if (!btn) fail('its own row (changed in the sheet) not offered: ' + await t.page.textContent('#plan'));
    else {
      await btn.click(); await G.idle(t);
      await t.ev('syncDay()'); await G.idle(t);
      const c = await G.box(t, 'c');
      if (c.sheetRow !== own || c.view !== 'sent' || c.row.weight !== '10') fail('after "mark as sent": ' + JSON.stringify({ row: c.sheetRow, view: c.view, w: c.row.weight }));
    }
    if (G.rowsWith(ctl, T2).length !== 1) fail('RITA LOPEZ written ' + G.rowsWith(ctl, T2).length + ' times');
    if (ctl.sheet.get(own).cells[3] !== '10') fail('the weight fixed in the sheet was written back: ' + ctl.sheet.get(own).cells[3]);
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

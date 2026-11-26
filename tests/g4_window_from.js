// F17: the backend looks back only 500 rows, so a busy day opened two days later comes back cut off at the top. With a
// backend that says where it started looking ("from", v10), a box whose row is above that is unknown, never "Not in
// sheet" (v37 flagged it — "never went into the sheet, Send as a new row" — which led to a second row); an old flag on
// such a box is left as it is; a box inside the scanned rows that points at another day's row is still flagged. With
// the v9 backend (no "from") the 3-day rule stays.
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'g4_window_from';
(async () => {
  const ctl = { start: 8011, sendFrom: true, window: 500 };
  const t = await G.begin(ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const D = G.daysAgo(2), ago = Date.now() - 56 * 3600000;
    const mk = (id, seq, row, trk, extra) => G.G2.sentBox(Object.assign({ id, seq, day: D, sentAt: ago, createdAt: ago, sheetRow: row, photosLinked: true, row: { customer: 'BOX ' + id.toUpperCase(), tracking: trk, weight: '3' } }, extra || {}));
    const u = mk('u', 1, 8012, 'TBA101010101010'), w = mk('w', 2, 8016, 'TBA202020202020'), x = mk('x', 3, 8011, 'TBA303030303030', { wrongRow: true });
    ctl.sheet.set(8011, G.sheetRow(G.daysAgo(6), ['SOMEONE ELSE', 'TBA303030303030', '1', '1', 'AMAZON', 'NO INVOICE', ''], []));
    ctl.sheet.set(8012, G.sheetRow(D, u.sentCells.slice(0, 7), []));
    ctl.sheet.set(8016, G.sheetRow(G.daysAgo(5), ['OLDER DAY', 'TBA202020202020', '1', '2', 'AMAZON', 'NO INVOICE', ''], []));
    for (let n = 8017; n <= 8020; n++) ctl.sheet.set(n, G.sheetRow(D, ['OTHER PHONE ' + n, 'TBA9999999' + n, '1', '5', 'AMAZON', 'NO INVOICE', ''], []));
    ctl.sheet.set(8515, G.sheetRow(G.today(), ['TODAY LAST', 'TBA888888888888', '1', '1', 'AMAZON', 'NO INVOICE', ''], []));
    await G.setLs(t, { autoSend: '0', nextRowSeen: '8516' });
    await G.seed(t, [u, w, x]);
    await t.ev(`S.day = "${D}", render(), 1`);     // the operator opens that day from the list
    await t.ev('syncDay()'); await G.idle(t);
    const st = async id => (await G.box(t, id)).wrongRow;
    if (await st('u')) fail('box u (row 8012, above where the backend looked) flagged "Not in sheet"');
    if (!(await st('x'))) fail('box x\'s old flag was cleared');
    if (!(await st('w'))) fail('box w (row 8016 holds an older day\'s box) not flagged');
    // the v9 backend: no "from", the 3-day rule as before
    ctl.sendFrom = false;
    await t.ev('syncDay()'); await G.idle(t);
    if (!(await st('u'))) fail('v9 backend: box u sent 56 h ago above the day\'s first row not flagged as before');
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

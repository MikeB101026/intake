// F22 (planSend): a box whose note its read never saw (as a failed send left it before) is read with the note before it
// goes in — and a tap on Send is kept: with auto-send off it still goes in, with the note's line, once that read is Ready.
const { G, L, begin5, view, rowWith } = require('./lib_g5.js');
(async () => {
  const ctl = {};
  const t = await begin5(ctl);
  let ok = true, why = '';
  try {
    await G.setLs(t, { autoSend: '0' });
    await G.seed(t, [G.readyBox({ id: 's1', note: 'ALSO 2 PHONE CASE' })]);   // Ready, read without its note
    await t.page.click('#sendBtn');                                            // "Send 1 to sheet"
    await t.page.waitForTimeout(400);
    await G.idle(t);
    const rows = rowWith(ctl, 'TBA111111111111'), b = await view(t, 's1');
    if (rows.length !== 1) { ok = false; why += ` ${rows.length} rows in the sheet (the tap was dropped?): ` + JSON.stringify(b); }
    else if (!/PHONE CASE/.test(rows[0].cells[6])) { ok = false; why += ' sent without the note’s line: ' + JSON.stringify(rows[0].cells); }
    if (b.readNote !== 'ALSO 2 PHONE CASE') { ok = false; why += ' the note was never read: ' + JSON.stringify(b); }
    if (G.pageErrors(t).length) { ok = false; why += ' page errors: ' + G.pageErrors(t).join(' | '); }
  } catch (e) { ok = false; why += ' ' + e.message; }
  finally { await t.close(); }
  L.report('g5_stale_note', ok, why);
})();

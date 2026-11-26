// F22 (b): a note typed on a card while its box shows "Sending…" is read with the box at once. When that send fails, the
// row that goes in afterwards holds what the note adds (before, Send wrote the read that never saw the note).
const { G, L, begin5, shot, typeField, view, rowWith } = require('./lib_g5.js');
(async () => {
  const ctl = {};
  let release, appends = 0;
  const held = new Promise(r => { release = r; });
  ctl.hook = async op => { if (op === 'append' && ++appends === 1) { await held; return 'ABORT'; } };   // the first send hangs, then is lost
  const t = await begin5(ctl);
  let ok = true, why = '';
  try {
    await shot(t, 'L1'); await shot(t, 'A');
    await t.page.click('#curFinish');
    await L.waitFor(t, 'S.sending.size > 0', 30000);              // read clean, on its way by itself — and stuck (weak signal)
    const id = await t.ev('[...S.sending][0]');
    await typeField(t, id, 'note', 'ALSO 2 PHONE CASE');           // typed while the card says Sending…
    await L.waitFor(t, '!S.active.size && !S.readQ.length', 20000);
    await t.page.waitForTimeout(300);
    release();                                                     // "No connection to the backend…"
    await L.waitFor(t, '!S.busy', 20000);
    await G.idle(t);
    // The operator taps Send again (when the box is still waiting for one).
    if (await t.ev(`document.querySelector('#sendBtn').dataset.mode === 'send'`)) { await t.page.click('#sendBtn'); await t.page.waitForTimeout(300); }
    await G.idle(t);
    const rows = rowWith(ctl, 'TBA111111111111'), b = await view(t, id);
    if (rows.length !== 1) { ok = false; why += ` ${rows.length} rows in the sheet: ` + JSON.stringify(b); }
    else if (!/PHONE CASE/.test(rows[0].cells[6])) { ok = false; why += ' the row went in without the note’s line: ' + JSON.stringify(rows[0].cells) + ' ' + JSON.stringify(b); }
    if (G.pageErrors(t).length) { ok = false; why += ' page errors: ' + G.pageErrors(t).join(' | '); }
  } catch (e) { ok = false; why += ' ' + e.message; }
  finally { await t.close(); }
  L.report('g5_note_send_failed', ok, why);
})();

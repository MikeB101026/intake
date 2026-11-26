// R31: box #1's count was fixed with + before it went in (contents fixed by hand). Not sent yet, a note's flag still says
// "…, or tap “Looks good”" (that button is there). Once it is in the sheet, a note typed on its card gives "The note
// changed after the contents were fixed by hand — type what it adds into Contents, then tap “Update sheet row”." (before:
// "or tap “Looks good”", a button a card in the sheet didn't have, so the flag could only go with an edit of Contents).
// The card in the sheet now has Looks good: it clears the flag without touching the row. A photo added later with
// + Camera: "NOT IN CONTENTS — … — type it into Contents, then tap “Update sheet row”"; typed in, Update puts it in.
const { G, G2, L, makeBackend5, typeField, view } = require('./lib_g5.js');
const NAME = 'r_R31_sent_flags';
const PORT = +process.env.PORT || 10670;
(async () => {
  const ctl = {};
  const t = await G.start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: makeBackend5(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const has = (id, act) => t.ev(`!!document.querySelector('[data-id="${id}"] [data-act="${act}"]')`);
  const NOTE_SENT = 'The note changed after the contents were fixed by hand — type what it adds into Contents, then tap “Update sheet row”.';
  try {
    await L.waitFor(t, 'PACE.ready || PACE.off', 15000); await G.idle(t);
    await G.seed(t, [G.readyBox({ id: 'h', ok: false, flags: ['COUNT UNSURE — ALPHA SHOE: SAME ITEM OR MORE?'], proof: [{ line: 'ALPHA SHOE (1 TOTAL)', photos: ['hp1'] }] })]);
    await G2.expand(t, 'h');
    await t.page.click('[data-id="h"] [data-act="lineqty"][data-d="1"]');   // + : ALPHA SHOE (2 TOTAL), fixed by hand
    await L.waitFor(t, `S.boxes.get('h').row.contents === 'ALPHA SHOE (2 TOTAL)'`, 5000);
    // not sent yet: a note's flag, worded with Looks good (the button is on the card)
    await typeField(t, 'h', 'note', 'FRAGILE');
    await t.page.waitForTimeout(400); await G.idle(t);
    let v = await view(t, 'h');
    if (!v.reasons.includes('The note changed after the contents were fixed by hand — type what it adds into Contents, or tap “Looks good”.')) fail('unsent: ' + JSON.stringify(v.reasons));
    await t.page.click('[data-id="h"] [data-act="ok"]');
    await t.page.waitForTimeout(300);
    await t.page.click('[data-id="h"] [data-act="send1"]');
    await L.waitFor(t, `!!S.boxes.get('h').sheetRow`, 20000);
    await G.idle(t);
    const sent0 = JSON.stringify(ctl.sheet.get(100).cells);
    // in the sheet: a new note
    await typeField(t, 'h', 'note', 'ALSO 2 PHONE CASE');
    await t.page.waitForTimeout(400); await G.idle(t);
    v = await view(t, 'h');
    if (v.view !== 'sent' || !v.reasons.includes(NOTE_SENT)) fail('in the sheet, after the note: ' + JSON.stringify(v));
    if (!(await has('h', 'ok'))) fail('no Looks good on the card in the sheet');
    else {
      await t.page.click('[data-id="h"] [data-act="ok"]');
      await t.page.waitForTimeout(300); await G.idle(t);
      v = await view(t, 'h');
      if (v.flags.length || v.reasons.length || v.view !== 'sent') fail('after Looks good: ' + JSON.stringify(v));
      if (await has('h', 'ok') || await has('h', 'upd')) fail('after Looks good the card still offers Looks good / Update');
      if (JSON.stringify(ctl.sheet.get(100).cells) !== sent0) fail('Looks good changed the row: ' + JSON.stringify(ctl.sheet.get(100).cells));
    }
    // a photo added with + Camera to the box in the sheet
    await G2.camOnCard(t, 'h', 1);
    await t.page.click('#camDone');
    await t.page.waitForTimeout(400); await G.idle(t);
    v = await view(t, 'h');
    if (!v.reasons.includes('NOT IN CONTENTS — CAMERA ITEM (1 TOTAL) — type it into Contents, then tap “Update sheet row”.')) fail('after + Camera: ' + JSON.stringify(v.reasons));
    await typeField(t, 'h', 'contents', 'ALPHA SHOE (2 TOTAL)\nCAMERA ITEM (1 TOTAL)');
    await t.page.waitForTimeout(300);
    if ((await view(t, 'h')).view !== 'dirty' || !(await has('h', 'upd'))) fail('typed in: not Changed');
    else { await t.page.click('[data-id="h"] [data-act="upd"]'); await t.page.waitForTimeout(500); await G.idle(t); }
    if (ctl.sheet.get(100).cells[6] !== 'ALPHA SHOE (2 TOTAL) ///\nCAMERA ITEM (1 TOTAL)') fail('row 100: ' + JSON.stringify(ctl.sheet.get(100).cells));
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

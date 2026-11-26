// F25 (photo): the operator fixed the contents by hand (+ on a line), then shot a forgotten product with + Camera. The
// read's line for it is not in the hand-fixed contents: the box shows "NOT IN CONTENTS — …" and waits on Check instead of
// going into the sheet without it. Typed into Contents, the flag goes, a later read doesn't bring it back, and the
// box goes in with the line.
const { G, G2, L, begin5, typeField, view, rowWith } = require('./lib_g5.js');
(async () => {
  const ctl = {};
  const t = await begin5(ctl);
  let ok = true, why = '';
  try {
    // A box that read "Check: COUNT UNSURE" (auto-send is on: it waits for the operator).
    await G.seed(t, [G.readyBox({ id: 'h1', ok: false, flags: ['COUNT UNSURE — ALPHA SHOE: SAME ITEM OR MORE?'], proof: [{ line: 'ALPHA SHOE (1 TOTAL)', photos: ['h1p1'] }] })]);
    let b = await view(t, 'h1');
    if (b.view !== 'check') throw new Error('setup: expected Check, got ' + JSON.stringify(b));
    await G2.expand(t, 'h1');
    await t.page.click('[data-id="h1"] [data-act="lineqty"][data-d="1"]');   // + : ALPHA SHOE (2 TOTAL)
    await L.waitFor(t, `S.boxes.get('h1').row.contents === 'ALPHA SHOE (2 TOTAL)'`, 5000);
    await G2.camOnCard(t, 'h1', 1);                                         // + Camera: the forgotten product
    await t.page.click('#camDone');
    await t.page.waitForTimeout(400);
    await G.idle(t);
    b = await view(t, 'h1');
    if (b.sheetRow || rowWith(ctl, 'TBA111111111111').length) { ok = false; why += ' went into the sheet without the new item: ' + JSON.stringify(b); }
    else if (b.view !== 'check' || !b.reasons.some(r => /^NOT IN CONTENTS — CAMERA ITEM/.test(r))) { ok = false; why += ' no NOT IN CONTENTS warning: ' + JSON.stringify(b); }
    if (ok) {
      // Typed into Contents: the warning goes, and a later read doesn't bring it back.
      await typeField(t, 'h1', 'contents', 'ALPHA SHOE (2 TOTAL)\nCAMERA ITEM (1 TOTAL)');
      await L.waitFor(t, `!S.boxes.get('h1').flags.some(f => /^NOT IN CONTENTS/.test(f))`, 5000).catch(() => {});
      b = await view(t, 'h1');
      if (b.flags.some(f => /^NOT IN CONTENTS/.test(f))) { ok = false; why += ' a hand fix kept the warning: ' + JSON.stringify(b); }
      await t.ev(`queueRead('h1')`);
      await t.page.waitForTimeout(400);
      await G.idle(t);
      b = await view(t, 'h1');
      const rows = rowWith(ctl, 'TBA111111111111');
      if (b.flags.some(f => /^NOT IN CONTENTS/.test(f))) { ok = false; why += ' the next read flagged a typed line again: ' + JSON.stringify(b); }
      else if (rows.length !== 1 || !/CAMERA ITEM/.test(rows[0].cells[6]) || !/ALPHA SHOE \(2 TOTAL\)/.test(rows[0].cells[6])) { ok = false; why += ' not sent with the fixed contents: ' + JSON.stringify(rows) + ' ' + JSON.stringify(b); }
    }
    if (G.pageErrors(t).length) { ok = false; why += ' page errors: ' + G.pageErrors(t).join(' | '); }
  } catch (e) { ok = false; why += ' ' + e.message; }
  finally { await t.close(); }
  L.report('g5_hand_fix_photo', ok, why);
})();

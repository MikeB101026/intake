// F32: "Send to sheet" on the box in progress after a note was typed since its read: it is read with the note first,
// and the tap is kept — with auto-send off it goes into the sheet once that read is Ready (before, the tap only re-read it
// and nothing said so). A read that ends on Check says so instead, and a read that gives it a watch-list warning the tap
// never saw holds it for the operator.
const { G, G2, L, begin5, shot, view, rowWith } = require('./lib_g5.js');
(async () => {
  const ctl = {};
  const t = await begin5(ctl);
  let ok = true, why = '';
  const fail = s => { ok = false; why += ' ' + s; };
  const notice = () => t.ev('document.querySelector("#notice").hidden ? "" : document.querySelector("#notice").textContent');
  // The box in progress, read early (a duplicate removed from its thumbnails), a note typed, then Send on its card.
  const sendAfterNote = async (shapes, note) => {
    for (const s of shapes) await shot(t, s);
    const id = await t.ev('S.current'), dup = await t.ev(`S.boxes.get(S.current).photos[${shapes.length - 1}]`);
    await t.page.click(`#curThumbs [data-photo="${dup}"]`);
    await t.page.click('#lbDel');                                   // Remove photo: the box is read now
    await L.waitFor(t, `viewStatus(S.boxes.get(${JSON.stringify(id)})) === 'ready'`, 20000);
    await G.idle(t);
    await t.page.click('#curNote'); await t.page.keyboard.type(note);
    await G2.expand(t, id);
    await t.page.click(`[data-id="${id}"] [data-act="send1"]`);
    await t.page.waitForTimeout(500);
    await G.idle(t);
    return id;
  };
  try {
    await G.setLs(t, { autoSend: '0' });
    await G.reload(t);
    // (1) Reads Ready with the note: it goes in, with the note's line.
    const id1 = await sendAfterNote(['L1', 'A', 'B'], 'ALSO 2 PHONE CASE');
    const r1 = rowWith(ctl, 'TBA111111111111'), b1 = await view(t, id1);
    if (r1.length !== 1) fail(`(1) the Send tap was dropped: ${r1.length} rows, ` + JSON.stringify(b1) + ';');
    else if (!/PHONE CASE/.test(r1[0].cells[6])) fail('(1) sent without the note’s line: ' + JSON.stringify(r1[0].cells) + ';');
    if (ok) {
      // (2) Reads Check with the note: not sent, and said.
      const id2 = await sendAfterNote(['L2', 'C', 'D'], 'UNSURE OF THE COUNT');
      const b2 = await view(t, id2), n2 = await notice();
      if (rowWith(ctl, 'TBA222222222222').length) fail('(2) a box that reads Check went in;');
      if (b2.view !== 'check') fail('(2) expected Check: ' + JSON.stringify(b2) + ';');
      if (!/Box #2 needs a check before it can go in/.test(n2)) fail('(2) nothing says the tap didn’t send it: ' + JSON.stringify(n2) + ';');
      if (await t.ev(`S.sendAfter.has(${JSON.stringify(id2)})`)) fail('(2) the tap is still kept after a Check;');
      // (3) Looks good, and a tap kept before the read gave it a watch-list name: held, and said.
      await t.page.click(`[data-id="${id2}"] [data-act="ok"]`);
      await t.ev(`(() => { S.watch = [{ name: 'MARY JONES', note: 'WATCH LIST: CALL FIRST', alts: [['MARY', 'JONES']] }]; S.sendAfter.set(${JSON.stringify(id2)}, ''); autoSend(); return 1; })()`);
      await t.page.waitForTimeout(500);
      await G.idle(t);
      if (rowWith(ctl, 'TBA222222222222').length) fail('(3) sent with a watch-list warning the tap never saw;');
      if (!/WATCH LIST: CALL FIRST — check it, then tap Send/.test(await notice())) fail('(3) not said: ' + JSON.stringify(await notice()) + ';');
    }
    if (G.pageErrors(t).length) fail('page errors: ' + G.pageErrors(t).join(' | '));
  } catch (e) { fail(e.message); }
  finally { await t.close(); }
  L.report('g5_send_after_read', ok, why);
})();

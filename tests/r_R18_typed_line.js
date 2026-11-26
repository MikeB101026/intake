// R18: box #1 reads "Check: COUNT UNSURE". The operator types the contents by hand — "ALPHA SHOE (2 TOTAL)" plus
// "CAMERA ITEM (1 TOTAL)", an item they see in the box but didn't photograph — then shoots that item with + Camera on the
// card and taps DONE. The read's line for the new photo is already in Contents word for word: no "NOT IN CONTENTS", and
// the box goes in by itself with the typed contents (before: it waited on Check for Looks good + Send). Box #2 is the same
// but the typed count differs ("CAMERA ITEM (2 TOTAL)") — a line the photo gives that isn't in Contents as it is: still
// flagged, and the box waits.
const { G, G2, L, makeBackend5, typeField, view, rowWith } = require('./lib_g5.js');
const NAME = 'r_R18_typed_line';
const PORT = +process.env.PORT || 10650;
(async () => {
  const ctl = {};
  const t = await G.start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: makeBackend5(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await L.waitFor(t, 'PACE.ready || PACE.off', 15000); await G.idle(t);
    await G.seed(t, [
      G.readyBox({ id: 'h1', seq: 1, ok: false, flags: ['COUNT UNSURE — ALPHA SHOE: SAME ITEM OR MORE?'], proof: [{ line: 'ALPHA SHOE (1 TOTAL)', photos: ['h1p1'] }] }),
      G.readyBox({ id: 'h2', seq: 2, ok: false, flags: ['COUNT UNSURE — BRAVO SOCK: SAME ITEM OR MORE?'], row: { customer: 'MARY JONES', tracking: 'TBA222222222222', weight: '7', contents: 'BRAVO SOCK (1 TOTAL)' }, proof: [{ line: 'BRAVO SOCK (1 TOTAL)', photos: ['h2p1'] }], _shapes: ['L2', 'B'] }),
    ]);
    if ((await view(t, 'h1')).view !== 'check' || (await view(t, 'h2')).view !== 'check') throw new Error('setup: expected both on Check');
    // box #1: typed word for word, then photographed
    await typeField(t, 'h1', 'contents', 'ALPHA SHOE (2 TOTAL)\nCAMERA ITEM (1 TOTAL)');
    await L.waitFor(t, `!!S.boxes.get('h1').editBase`, 5000);
    await G2.camOnCard(t, 'h1', 1);
    await t.page.click('#camDone');
    await t.page.waitForTimeout(400); await G.idle(t);
    const b1 = await view(t, 'h1'), r1 = rowWith(ctl, 'TBA111111111111');
    if (b1.flags.some(f => /^NOT IN CONTENTS/.test(f))) fail('box #1 flagged a typed line: ' + JSON.stringify(b1.flags));
    if (r1.length !== 1 || r1[0].cells[6] !== 'ALPHA SHOE (2 TOTAL) ///\nCAMERA ITEM (1 TOTAL)') fail('box #1 didn’t go in with the typed contents: ' + JSON.stringify({ rows: r1, b1 }));
    // box #2: the typed count isn't what the photo gives
    await typeField(t, 'h2', 'contents', 'BRAVO SOCK (2 TOTAL)\nCAMERA ITEM (2 TOTAL)');
    await L.waitFor(t, `!!S.boxes.get('h2').editBase`, 5000);
    await G2.camOnCard(t, 'h2', 1);
    await t.page.click('#camDone');
    await t.page.waitForTimeout(400); await G.idle(t);
    const b2 = await view(t, 'h2');
    if (!b2.flags.includes('NOT IN CONTENTS — CAMERA ITEM (1 TOTAL)') || b2.view !== 'check') fail('box #2 (another count) not flagged: ' + JSON.stringify(b2));
    if (rowWith(ctl, 'TBA222222222222').length) fail('box #2 went in');
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

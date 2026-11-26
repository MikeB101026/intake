// F29 (display): every inside photo of a box shows once on its card — on its contents line (the first 4 of a line) or in
// the row below (a 5th photo of a line, one on no line) — before and after the contents are fixed by hand. Before, a line
// showed at most 4, and after a hand fix the photos on no line vanished from the card.
const { G, G2, L, begin5, typeField } = require('./lib_g5.js');
(async () => {
  const ctl = {};
  const t = await begin5(ctl);
  let ok = true, why = '';
  const inside = ['c1p1', 'c1p2', 'c1p3', 'c1p4', 'c1p5', 'c1p6'];
  const counts = () => t.ev(`(() => { const n = {}; for (const el of document.querySelectorAll('[data-id="c1"] [data-photo]')) n[el.dataset.photo] = (n[el.dataset.photo] || 0) + 1; return n; })()`);
  const check = async when => {
    const n = await counts(), bad = inside.filter(id => n[id] !== 1);
    if (bad.length) { ok = false; why += ` ${when}: ${bad.map(id => `${id} shown ${n[id] || 0}×`).join(', ')};`; }
  };
  try {
    // One item shot from 5 sides (one line, 5 photos) and a packing slip on no line; already in the sheet.
    await G.seed(t, [G2.sentBox({ id: 'c1', sheetRow: 100, photosLinked: true, row: { contents: 'ALPHA SHOE (5 TOTAL)' },
      proof: [{ line: 'ALPHA SHOE (5 TOTAL)', photos: ['c1p1', 'c1p2', 'c1p3', 'c1p4', 'c1p5'] }], _shapes: ['L1', 'A', 'B', 'C', 'D', 'E', 'F'] })]);
    await G2.expand(t, 'c1');
    await t.page.waitForTimeout(300);
    await check('as read');
    // The operator types the slip's line into Contents (a hand fix).
    await typeField(t, 'c1', 'contents', 'ALPHA SHOE (5 TOTAL)\nPACKING SLIP (1 TOTAL)');
    await L.waitFor(t, `S.boxes.get('c1').edited.contents`, 5000);
    await t.page.waitForTimeout(300);
    await check('after a hand fix');
    if (G.pageErrors(t).length) { ok = false; why += ' page errors: ' + G.pageErrors(t).join(' | '); }
  } catch (e) { ok = false; why += ' ' + e.message; }
  finally { await t.close(); }
  L.report('g5_card_photos', ok, why);
})();

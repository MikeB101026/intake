// F31: the per-photo sort failed (weak signal), so the read sorts the photos itself; while that sort runs, the operator
// opens the label photo and taps "Make it a label". The flip must stand (v37: the sort's answer, "inside", overwrote
// it, and the box waited on "No label photo").
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'g1_sort_flip';
(async () => {
  let release; const hold = new Promise(r => { release = r; });
  const ctl = { sortFail: true, classifyAs: { L2: 'inside' }, hook: async kind => { if (kind === 'classify') await hold; } };
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: L.makeBackend(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    await L.phonePhoto(t, 'L2'); await L.phonePhoto(t, 'C');
    await L.waitFor(t, '!S.sortP.size', 10000);         // both per-photo sorts failed: no L / IN tags
    const [id, lab] = await t.ev('JSON.stringify([S.current, S.boxes.get(S.current).photos[0]])').then(JSON.parse);
    await t.page.click('#curFinish');
    await L.waitFor(t, `S.active.has(${JSON.stringify(id)})`, 10000);
    await t.page.waitForTimeout(300);                   // the read's sort call is on its way
    await t.page.click(`[data-id="${id}"] [data-act="toggle"]`);
    await t.page.click(`[data-id="${id}"] [data-photo="${lab}"]`);
    await t.page.click('#lbKind');                      // "Make it a label"
    await L.waitFor(t, `S.photos.get(${JSON.stringify(lab)}).kind === 'label'`, 5000);
    release();                                          // the sort answers "inside" for the label
    await L.waitIdle(t, 20000);
    const kind = await t.ev(`S.photos.get(${JSON.stringify(lab)}).kind`), bx = await L.boxes(t);
    if (kind !== 'label') fail('the flip was overwritten: kind ' + kind);
    if (!ctl.sheet.rows.some(r => r.cells[0] === 'MARY JONES')) fail('box not read with its label: ' + JSON.stringify(bx.map(b => [b.view, b.customer, b.reasons])));
    if (t.errs.length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { release(); await t.close(); }
  L.report(NAME, ok, why);
})();

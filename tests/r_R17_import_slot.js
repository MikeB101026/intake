// R17: another phone's box (row 900, 8 photos in Drive, each takes 1.5 s to download on this weak signal). The operator
// opens its card and taps Read again as soon as it is offered, and again a moment later; then finishes a box of their
// own. Their own box must reach the sheet in its usual time (v38 held the one read slot for the whole download, ~12 s,
// so every own box waited behind it), and the other phone's box is still read exactly once, with all 8 photos, at
// high effort (Read again), once they are all here.
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'r_R17_import_slot';
const PORT = +process.env.PORT || 10430;
(async () => {
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const disp = day => { const [y, m, d] = day.split('-'); return `${d} ${MON[+m - 1]} ${y}`; };
  const shapes = ['L4', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
  let page; const reads = [];
  const ctl = {
    dayRows: day => [{ row: 900, cells: ['ANNA LEE', 'TBA444444444444', '1', '2', 'AMAZON', 'NO INVOICE', 'ALPHA SHOE (1 TOTAL)', disp(day)],
      pics: shapes.map((s, i) => ({ id: 'P-' + s + 'xxxxxxxxxxxxxxxxxxxxxx', label: i ? 'INSIDE ' + i : 'LABEL 1' })) }],
    photoGet: async id => { await L.sleep(1500); return (await L.jpeg(page, id.slice(2).replace(/x+$/, ''))).toString('base64'); },
    hook: async (kind, ids, body) => { reads.push({ kind, ids, effort: body.effort, careful: !!body.careful, t: Date.now() }); },
  };
  ctl.sheet = { rows: [], next: 100 };
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: L.makeBackend(ctl) });
  page = t.page;
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await L.waitFor(t, 'allBoxes().filter(b => b.imported).length === 1', 15000);
    const id = await t.ev('allBoxes().find(b => b.imported).id'), q = JSON.stringify(id);
    await t.page.click(`[data-id="${id}"] [data-act="toggle"]`);
    await L.waitFor(t, `S.boxes.get(${q}).photos.length >= 1 && !document.querySelector('[data-id="${id}"] [data-act="reread"]').disabled`, 15000);
    await t.page.click(`[data-id="${id}"] [data-act="reread"]`);
    await t.page.waitForTimeout(700);
    await t.page.click(`[data-id="${id}"] [data-act="reread"]`);   // tapped again while its photos still download
    await t.page.waitForTimeout(300);
    // the operator's own box
    await L.phonePhoto(t, 'L1'); await L.phonePhoto(t, 'H');
    await L.waitFor(t, '!S.sortP.size');
    const t0 = Date.now();
    await t.page.click('#curFinish');
    await L.waitFor(t, `!!allBoxes().find(b => b.row.customer === 'JOHN SMITH' && b.sheetRow)`, 60000);
    const ms = Date.now() - t0;
    const loaded = await t.ev(`S.boxes.get(${q}).photos.length`);
    if (ms > 5000) fail(`own box took ${ms} ms from Finish to the sheet (the other phone's download held the read slot)`);
    if (loaded >= 8) fail(`setup: the other phone's photos were all in (${loaded}) before the own box was sent`);
    // the other phone's box: read once, when all 8 are in
    await L.waitFor(t, `S.boxes.get(${q}).photos.length === 8 && !picsLoading.size`, 30000);
    await L.waitIdle(t); await t.page.waitForTimeout(1000); await L.waitIdle(t);
    const theirs = reads.filter(r => r.ids.includes('L4') && (r.kind === 'main' || r.kind === 'label'));
    if (theirs.length !== 1) fail(`the other phone's box was read ${theirs.length} times: ` + JSON.stringify(theirs.map(r => [r.kind, r.ids.length, r.effort])));
    else if (theirs[0].ids.length !== 8 || theirs[0].effort !== 'high' || !theirs[0].careful) fail('its read: ' + JSON.stringify(theirs[0]));
    const err = await t.ev(`S.boxes.get(${q}).readError`);
    if (err) fail('read error on the other phone’s card: ' + err);
    if (t.errs.filter(e => !/Failed to load resource/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

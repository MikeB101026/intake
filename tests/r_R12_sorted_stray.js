// R12: the first start after the update finds photos that name a box but that no box lists. A photo the operator
// removed under v37 while the box was being read (v37 wrote it back, already sorted) must not come back into its box:
// box "sb" (in the sheet, photos saved to Drive) and box "ub" (not sent yet) each have such a photo (kind set). They
// wait to be sorted instead — v38 put them back, so "sb" saved its photos to Drive again with the removed one in
// AV–BJ, and "ub" was read again with it. A photo whose save was cut off while it was taken has no kind yet: box "nb"'s
// one still goes back into its box, as before.
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'r_R12_sorted_stray';
const PORT = +process.env.PORT || 10420;
(async () => {
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: G.makeBackend2(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    const now = Date.now();
    const sb = G.sentBox({ id: 'sb', seq: 1, sheetRow: 100, photos: ['s1', 's2'], photosLinked: true, savedIds: ['s1', 's2'], createdAt: now - 600000, sentAt: now - 500000 });
    const row = { customer: 'MARY JONES', tracking: 'TBA222222222222', pieces: 1, weight: '7', shipper: 'AMAZON', invoice: false, contents: 'CHARLIE LAMP (1 TOTAL)' };
    const ub = { id: 'ub', day: G.today(), seq: 2, createdAt: now - 400000, updatedAt: now - 300000, photos: ['u1', 'u2'], note: '', status: 'read', row, proof: [], flags: [], badges: [],
      read: { at: now - 300000, effort: 'medium', note: '' }, readError: '', edited: {}, ok: false, sheetRow: null, sentCells: null, trk4s: [], noTotals: false };
    const nb = Object.assign({}, ub, { id: 'nb', seq: 3, photos: ['n1'], status: 'read', row: Object.assign({}, row, { customer: 'PETER PAN', tracking: 'TBA333333333333', contents: '' }) });
    ctl.sheet.rows.push({ row: 100, day: sb.day, cells: sb.sentCells.slice(0, 7), pics: [{ id: 'D1xxxxxxxxxxxxxxxxxxxxxx', label: 'LABEL 1' }, { id: 'D2xxxxxxxxxxxxxxxxxxxxxx', label: 'INSIDE 1' }] });
    ctl.sheet.next = 101;
    await t.page.evaluate(() => { localStorage.setItem('autoSend', '0'); });   // nothing goes in by itself: what the start-up does is what's checked
    await G.inject(t, [
      { id: 's1', shape: 'L1', kind: 'label', box: 'sb', t: now - 590000 }, { id: 's2', shape: 'A', kind: 'item', box: 'sb', t: now - 580000 },
      { id: 'sx', shape: 'B', kind: 'item', box: 'sb', t: now - 570000 },          // removed under v37, written back by its read
      { id: 'u1', shape: 'L2', kind: 'label', box: 'ub', t: now - 390000 }, { id: 'u2', shape: 'C', kind: 'item', box: 'ub', t: now - 380000 },
      { id: 'ux', shape: 'D', kind: 'item', box: 'ub', t: now - 370000 },          // the same, on a box not sent yet
      { id: 'n1', shape: 'L3', kind: 'label', box: 'nb', t: now - 360000 },
      { id: 'nx', shape: 'E', kind: null, box: 'nb', t: now - 350000 },            // cut off while it was taken: no kind yet
    ], [sb, ub, nb]);
    const calls0 = ctl.log.length;
    await G.reload(t);
    await L.waitFor(t, 'S.boxes.size === 3', 10000);
    await t.page.waitForTimeout(1500); await G.idle(t);
    const st = JSON.parse(await t.ev(`JSON.stringify({ sb: S.boxes.get('sb').photos, sbLinked: !!S.boxes.get('sb').photosLinked, ub: S.boxes.get('ub').photos, ubStatus: S.boxes.get('ub').status,
      nb: S.boxes.get('nb').photos, pend: pendingPhotos().map(p => p.id).sort(), boxOf: Object.fromEntries(['sx', 'ux', 'nx'].map(id => [id, S.photos.has(id) ? S.photos.get(id).box : 'gone'])) })`));
    if (st.sb.includes('sx') || st.sb.length !== 2) fail('box sb got the removed photo back: ' + JSON.stringify(st.sb));
    if (!st.sbLinked) fail('box sb no longer counts its photos as saved (they would go to Drive again)');
    if (ctl.uploads.some(u => u.row === 100)) fail('row 100\'s photos were saved to Drive again: ' + JSON.stringify(ctl.uploads.map(u => u.who)));
    if (st.ub.includes('ux') || st.ub.length !== 2) fail('box ub got the removed photo back: ' + JSON.stringify(st.ub));
    const reads = ctl.log.slice(calls0).filter(c => c.ids.includes('L2'));
    if (reads.length) fail('box ub was read again: ' + JSON.stringify(reads.map(c => c.kind)));
    if (JSON.stringify(st.pend) !== '["sx","ux"]') fail('waiting to be sorted: ' + JSON.stringify(st.pend));
    if (st.boxOf.sx !== null || st.boxOf.ux !== null) fail('the removed photos still name their box: ' + JSON.stringify(st.boxOf));
    if (!st.nb.includes('nx')) fail('the photo cut off while it was taken didn’t go back into box nb: ' + JSON.stringify(st.nb));
    // what was decided is kept: the next start changes nothing
    await G.reload(t);
    await L.waitFor(t, 'S.boxes.size === 3', 10000); await t.page.waitForTimeout(800); await G.idle(t);
    const st2 = JSON.parse(await t.ev(`JSON.stringify({ sb: S.boxes.get('sb').photos.length, ub: S.boxes.get('ub').photos.length, pend: pendingPhotos().map(p => p.id).sort() })`));
    if (st2.sb !== 2 || st2.ub !== 2 || JSON.stringify(st2.pend) !== '["sx","ux"]') fail('after the next start: ' + JSON.stringify(st2));
    if (t.errs.filter(e => !/Failed to load resource/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

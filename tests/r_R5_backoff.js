// R5: a photo save the backend keeps refusing is tried less and less often. Box "old" of 3 days ago sits at row 100,
// but a row above it was deleted by hand: row 100 now holds another package and every save is refused ("no longer
// holds this box"); its own row is 99 now. Box "net" of today (row 101) fails for lost signal. The app stays on screen
// for 30 simulated minutes (a sync every 30 s, the phone back online at minutes 10 and 20).
//  - the refused box waits 2, 4, 8, 16 … minutes between tries, is not tried again at a restart nor when the phone is
//    back online (v38: a full upload every ~2 minutes, at every start and at every 'online', for good);
//  - the lost-signal box still goes at every 'online' (F26), but the sync's tries back off too;
//  - when its day is opened the sync moves "old" to row 99 and it is saved there at once; "net" goes once the signal is back.
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'r_R5_backoff';
const PORT = +process.env.PORT || 10210;
(async () => {
  const ctl = {}, base = G.makeBackend2(ctl), tries = [];
  let netDown = true;
  const backend = async (op, body, calls) => {
    if (op === 'photos') { tries.push({ row: +body.row, n: (body.photos || []).length }); if (+body.row === 101 && netDown) return 'ABORT'; }
    return base(op, body, calls);
  };
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const count = row => tries.filter(x => x.row === row).length;
  try {
    await t.page.waitForTimeout(500);
    const day = G.daysAgo(3), at = Date.now() - 3 * 86400000, err = 'No connection to the backend. Check your signal and try again.';
    const old = G.sentBox({ id: 'old', day, seq: 1, sheetRow: 100, photos: ['o1', 'o2', 'o3'], linkError: err, createdAt: at, sentAt: at });   // left by v37: no linkErrAt
    const net = G.sentBox({ id: 'net', seq: 1, sheetRow: 101, photos: ['n1', 'n2'], linkError: err, linkErrAt: Date.now() - 30000, row: { customer: 'MARY JONES', tracking: 'TBA222222222222' } });
    await G.inject(t, [{ id: 'o1', shape: 'L1', kind: 'label', box: 'old' }, { id: 'o2', shape: 'A', kind: 'item', box: 'old' }, { id: 'o3', shape: 'B', kind: 'item', box: 'old' },
      { id: 'n1', shape: 'L2', kind: 'label', box: 'net' }, { id: 'n2', shape: 'C', kind: 'item', box: 'net' }], [old, net]);
    ctl.sheet.rows.push({ row: 99, day, cells: old.sentCells.slice(0, 7), pics: [] },
      { row: 100, day, cells: ['PETER PAN', 'TBA333333333333', '1', '9', 'AMAZON', 'NO INVOICE', 'CHARLIE LAMP (1 TOTAL)'], pics: [] }, G.sheetRowFor(net, 101));
    await G.reload(t);
    await L.waitFor(t, 'S.boxes.size === 2', 10000);
    await t.page.waitForTimeout(1500); await G.idle(t, 60000);
    if (count(100) !== 1 || count(101) !== 1) throw new Error(`setup: start-up tries ${count(100)} / ${count(101)}`);
    if (!/no longer holds this box/.test(await t.ev('S.boxes.get("old").linkError'))) throw new Error('setup: old: ' + await t.ev('S.boxes.get("old").linkError'));
    // a restart right after: the refused box waits, the lost-signal one goes again
    await G.reload(t);
    await L.waitFor(t, 'S.boxes.size === 2', 10000);
    await t.page.waitForTimeout(1500); await G.idle(t, 60000);
    if (count(100) !== 1) fail(`the refused save went again at the restart (${count(100) - 1} more)`);
    if (count(101) !== 2) fail(`the lost-signal save at the restart: ${count(101) - 1} tries (expected 1)`);
    // 30 simulated minutes on screen
    await t.ev('(() => { const real = Date.now; window.__off = 0; Date.now = () => real() + window.__off; return 1; })()');
    const o0 = count(100), n0 = count(101), atOnline = [];
    for (let i = 1; i <= 60; i++) {
      await t.ev('window.__off += 30000, 1');
      await t.ev('syncDay().then(() => 1)');
      await t.page.waitForTimeout(60); await G.idle(t, 60000);
      if (i === 20 || i === 40) {
        const a = count(100), b = count(101);
        await t.page.evaluate(() => window.dispatchEvent(new Event('online')));
        await t.page.waitForTimeout(150); await G.idle(t, 60000);
        atOnline.push([count(100) - a, count(101) - b]);
      }
    }
    const oN = count(100) - o0, nN = count(101) - n0;
    if (process.env.VERBOSE) console.log(JSON.stringify({ refused30min: oN, lostSignal30min: nN, atOnline }));
    if (oN > 5) fail(`refused save: ${oN} uploads in 30 minutes (expected at most 5)`);
    if (atOnline.some(x => x[0])) fail('refused save went again when the phone came back online ' + JSON.stringify(atOnline));
    if (atOnline.some(x => x[1] !== 1)) fail('lost-signal save not tried when the phone came back online ' + JSON.stringify(atOnline));
    if (nN > 6) fail(`lost-signal save: ${nN} uploads in 30 minutes (expected at most 6)`);
    // the day of the refused box is opened: the sync moves it to row 99, and it goes there at once
    const s0 = ctl.uploads.length;
    await t.page.selectOption('#daySel', day);
    await L.waitFor(t, 'S.boxes.get("old").photosLinked', 20000).catch(() => {});
    await G.idle(t, 60000);
    const up = ctl.uploads.slice(s0).find(u => u.row === 99), ob = await G.box(t, 'old');
    if (!up || up.n !== 3 || ob.sheetRow !== 99 || !ob.linked) fail('after its day was opened: ' + JSON.stringify({ row: ob.sheetRow, linked: ob.linked, err: ob.linkError, ups: ctl.uploads.slice(s0) }));
    // the signal is back: the lost-signal box goes at the next 'online'
    netDown = false;
    await t.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await L.waitFor(t, 'S.boxes.get("net").photosLinked', 20000).catch(() => {});
    await G.idle(t, 60000);
    if (!(await G.box(t, 'net')).linked) fail('the lost-signal box not saved once the signal was back');
    const st = await t.ev('JSON.stringify(["old", "net"].map(id => { const b = S.boxes.get(id); return [b.linkErrAt || 0, b.linkFails || 0, !!b.linkRefused]; }))');
    if (st !== '[[0,0,false],[0,0,false]]') fail('the wait between tries is still on the saved boxes: ' + st);
    if (t.errs.filter(e => !/Failed to load resource|ERR_FAILED/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

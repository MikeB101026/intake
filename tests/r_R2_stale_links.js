// R2: two phones, one sheet. A photo save of another phone's box rewrites AV–BJ with exactly what it sends, so it must
// take the row's links as they are now, not those of phone B's last sync.
//  1) Phone A sends box #1 (label + 2 contents); its photo save is still under way when B's sync shows the row (no
//     links yet). A's save lands, and before B's next sync B's operator adds a photo to that card (+ Camera, DONE).
//     AV–BJ must link A's 3 and B's 1 (v38 wrote B's photo only: A's 3 lost their links).
//  2) Box #2: B adds a photo while A's save is still under way: B's save waits for A's links, then sends all 4 (v38 wrote
//     B's photo, and A's save then dropped it).
//  3) Box #3: B's save fails (no signal) while A's save is still under way; A's save lands; the retry from B's 30-s sync
//     sends all 4 (v38 retried before the sync's links were taken: B's photo only).
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'r_R2_stale_links';
const PORT = +process.env.PORT || 10200;
(async () => {
  const ctl = {}, base = G.makeBackend2(ctl), gates = {}, offB = new Set();
  const hold = row => { let open; gates[row] = { p: new Promise(r => { open = r; }), open: () => { delete gates[row]; open(); } }; };
  const forA = async (op, body, calls) => { if (op === 'photos' && gates[+body.row]) await gates[+body.row].p; return base(op, body, calls); };
  const forB = async (op, body, calls) => offB.has(op) ? 'ABORT' : base(op, body, calls);
  const repo = process.env.REPO || require('path').resolve(__dirname, '..');
  const A = await start({ repo, port: PORT, backend: forA });
  const B = await start({ repo, port: PORT + 1, backend: forB });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const linked = row => { const r = ctl.sheet.rows.find(x => x.row === row); return (r && r.pics || []).map(p => { const f = ctl.drive.get(p.id); return f ? L.idOf(f.b64) : '??'; }).sort().join(','); };
  // B's 30-s sync only when the test says so: B's operator acts before its next one
  const syncB = () => B.ev('(syncBusy = false, syncDay().then(() => { syncBusy = true; return 1; }))');
  const bCard = row => B.ev(`(allBoxes().find(b => b.sheetRow === ${row}) || {}).id`);
  async function aSends(shapes, row) {
    hold(row);
    for (const s of shapes) await L.phonePhoto(A, s);
    await L.waitFor(A, '!S.sortP.size');
    await A.page.click('#curFinish');
    await L.waitFor(A, `allBoxes().some(b => b.sheetRow === ${row}) && S.linking`, 30000);   // in the sheet, its photo save held
    await syncB();
    await L.waitFor(B, `allBoxes().some(b => b.imported && b.sheetRow === ${row})`, 10000);
    if ((await B.ev(`JSON.stringify(allBoxes().find(b => b.sheetRow === ${row}).pics)`)) !== '[]') throw new Error(`setup: row ${row} had links at B's sync`);
  }
  async function bShoots(row) {
    const id = await bCard(row);
    await G.camOnCard(B, id, 1);
    await B.page.click('#camDone');
    await L.waitFor(B, 'document.querySelector("#cam").hidden', 10000);
    return id;
  }
  const aSaved = row => L.waitFor(A, `allBoxes().some(b => b.sheetRow === ${row} && b.photosLinked)`, 20000).then(() => G.idle(A));
  try {
    await A.page.waitForTimeout(600); await B.page.waitForTimeout(300);
    await B.ev('(syncBusy = true, 1)');
    // 1) B adds its photo right after A's save landed
    await aSends(['L1', 'A', 'B'], 100);
    gates[100].open(); await aSaved(100);
    if (linked(100) !== 'A,B,L1') throw new Error('setup: row 100 after A\'s save: ' + linked(100));
    await bShoots(100);
    await B.page.waitForTimeout(800); await G.idle(B, 60000);
    if (linked(100) !== '?,A,B,L1') fail(`1) row 100 links ${linked(100)} (expected A's 3 and B's photo)`);
    // 2) B adds its photo while A's save is still under way
    await aSends(['L2', 'C', 'D'], 101);
    await bShoots(101);
    await B.page.waitForTimeout(1000);
    gates[101].open(); await aSaved(101);
    await B.page.waitForTimeout(500); await G.idle(B, 60000);
    if (linked(101) !== '?,C,D,L2') fail(`2) row 101 links ${linked(101)} (expected A's 3 and B's photo)`);
    // 3) B's save fails while A's is under way; A's lands; B's 30-s sync retries
    await aSends(['L3', 'E', 'F'], 102);
    offB.add('photos'); offB.add('photoGet');
    const c = await bShoots(102);
    await L.waitFor(B, `!!S.boxes.get(${JSON.stringify(c)}).linkError`, 60000); await G.idle(B, 60000);
    offB.clear();
    gates[102].open(); await aSaved(102);
    if (linked(102) !== 'E,F,L3') throw new Error('setup: row 102 after A\'s save: ' + linked(102));
    await B.ev(`patchBox(${JSON.stringify(c)}, x => { x.linkErrAt = Date.now() - 130000; }).then(() => 1)`);   // 2 minutes on
    await syncB();
    await B.page.waitForTimeout(500); await G.idle(B, 60000);
    if (linked(102) !== '?,E,F,L3') fail(`3) row 102 links ${linked(102)} after the sync's retry (expected A's 3 and B's photo)`);
    const bx = JSON.parse(await B.ev('JSON.stringify(allBoxes().map(b => ({ row: b.sheetRow, n: b.photos.length, linked: !!b.photosLinked })))'));
    for (const x of bx) if (x.n !== 4 || !x.linked) fail(`B's card of row ${x.row}: ${x.n} photos, ${x.linked ? 'saved' : 'not saved'}`);
    const errs = [...A.errs, ...B.errs].filter(e => !/Failed to load resource|ERR_FAILED/.test(e));
    if (errs.length) fail('page errors ' + JSON.stringify(errs));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { for (const g of Object.values(gates)) g.open(); await A.close(); await B.close(); }
  L.report(NAME, ok, why);
})();

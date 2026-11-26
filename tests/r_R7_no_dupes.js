// R7: two phones, one sheet. Every photo save makes new Drive files, so when phone A saves its sent box again, phone B's
// copies of the row's old links must leave B's card (B's own shots stay) and the new set loads once.
//  1) B has A's card open (3 photos loaded). A adds a photo (+ Camera, DONE): B's next sync shows 4, not 7, and B's own
//     added photo then saves 5 links, no duplicates (v38: 7 on the card, 8 links).
//  2) B opened A's card #2 once and closed it. A removes a wrong photo in the viewer: when B opens the card again it holds
//     the 3 left, and B's next save doesn't bring the removed one back into AV–BJ.
//  3) B saves A's card #3 itself while a 30-s sync whose answer was read before that save is on its way: the old links
//     never come back (v38: 7 photos for a 4-photo box).
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'r_R7_no_dupes';
const PORT = +process.env.PORT || 10220;
(async () => {
  const ctl = {}, inner = G.makeBackend2(ctl);
  let stale = null;   // { up0 }: the next dayRows of B answers with the sheet as it is now, once the next photo save landed
  const forB = async (op, body, calls) => {
    if (op === 'dayRows' && stale) {
      const s = stale; stale = null;
      const snap = JSON.parse(JSON.stringify(await inner(op, body, calls)));
      const t0 = Date.now();
      while (ctl.uploads.length <= s.up0 && Date.now() - t0 < 20000) await L.sleep(20);
      await L.sleep(400);
      return snap;
    }
    return inner(op, body, calls);
  };
  const repo = process.env.REPO || require('path').resolve(__dirname, '..');
  const A = await start({ repo, port: PORT, backend: inner });
  const B = await start({ repo, port: PORT + 1, backend: forB });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const linked = row => { const r = ctl.sheet.rows.find(x => x.row === row); return (r && r.pics || []).map(p => { const f = ctl.drive.get(p.id); return f ? L.idOf(f.b64) : '??'; }).sort().join(','); };
  const card = id => B.ev(`JSON.stringify((b => ({ n: b.photos.length, shapes: b.photos.map(pid => { const p = S.photos.get(pid); return p ? window.shapeOf(p) : 'gone'; }).sort().join(','), pics: (b.pics || []).length, done: (b.picsDone || []).length }))(S.boxes.get(${JSON.stringify(id)})))`).then(JSON.parse);
  const syncB = async () => { await B.ev('syncDay().then(() => 1)'); await B.page.waitForTimeout(300); await L.waitFor(B, '!picsLoading.size && !syncBusy', 20000); await G.idle(B); };
  const expandB = async id => { await G.expand(B, id); await B.page.waitForTimeout(200); await L.waitFor(B, '!picsLoading.size', 20000); await G.idle(B); };
  async function aSends(shapes, row) {
    for (const s of shapes) await L.phonePhoto(A, s);
    await L.waitFor(A, '!S.sortP.size');
    await A.page.click('#curFinish');
    await L.waitFor(A, `allBoxes().some(b => b.sheetRow === ${row} && b.photosLinked)`, 30000); await G.idle(A, 60000);
    await syncB();
    const id = await B.ev(`(allBoxes().find(b => b.imported && b.sheetRow === ${row}) || {}).id`);
    if (!id) throw new Error(`setup: row ${row} not on phone B`);
    return { a: await A.ev(`allBoxes().find(b => b.sheetRow === ${row}).id`), b: id };
  }
  async function shoot(t, id) {
    await G.camOnCard(t, id, 1);
    await t.page.click('#camDone');
    await L.waitFor(t, 'document.querySelector("#cam").hidden', 10000);
    await t.page.waitForTimeout(800); await G.idle(t, 60000);
  }
  try {
    await A.page.waitForTimeout(600); await B.page.waitForTimeout(300);
    // a photo's shape on B, as the fake Claude tells them apart (h / w; the camera's own frames are "?")
    await B.page.evaluate(SH => { window.shapeOf = p => { const r = p.h / p.w; let best = '?', bd = 0.008; for (const [k, v] of Object.entries(SH)) if (Math.abs(v - r) < bd) { bd = Math.abs(v - r); best = k; } return best; }; }, L.SHAPES);
    // 1) the card is open on B while A adds a photo
    const c1 = await aSends(['L1', 'A', 'B'], 100);
    await expandB(c1.b);
    if ((await card(c1.b)).n !== 3) throw new Error('setup: B\'s card #1 ' + JSON.stringify(await card(c1.b)));
    await shoot(A, c1.a);
    if (linked(100) !== '?,A,B,L1') throw new Error('setup: row 100 after A\'s photo ' + linked(100));
    await syncB();
    const s1 = await card(c1.b);
    if (s1.n !== 4 || s1.shapes !== '?,A,B,L1' || s1.done !== 4) fail('1) B\'s card after the sync ' + JSON.stringify(s1));
    const u1 = ctl.uploads.length;
    await shoot(B, c1.b);
    const up1 = ctl.uploads.slice(u1).filter(u => u.row === 100).pop();
    if (!up1 || up1.n !== 5 || linked(100) !== '?,?,A,B,L1') fail('1) B\'s save ' + JSON.stringify(up1 && up1.who) + ' → row 100 ' + linked(100));
    // 2) opened once and closed; A removes a wrong photo
    const c2 = await aSends(['L2', 'C', 'D', 'E'], 101);
    await expandB(c2.b);
    await B.page.click(`[data-id="${c2.b}"] [data-act="toggle"]`);              // B closes the card
    const pid = await A.ev(`S.boxes.get(${JSON.stringify(c2.a)}).photos.find(id => { const p = S.photos.get(id); return p && Math.abs(p.h / p.w - ${L.SHAPES.E}) < 0.004; })`);
    if (!pid) throw new Error('setup: photo E not found on A');
    await A.ev(`openLb(${JSON.stringify(pid)})`);
    await A.page.click('#lbDel');
    await A.page.waitForTimeout(500); await G.idle(A, 60000);
    if (linked(101) !== 'C,D,L2') throw new Error('setup: row 101 after A removed E ' + linked(101));
    await syncB();
    await expandB(c2.b);
    const s2 = await card(c2.b);
    if (s2.n !== 3 || s2.shapes !== 'C,D,L2') fail('2) B\'s card opened again ' + JSON.stringify(s2));
    await shoot(B, c2.b);
    if (linked(101) !== '?,C,D,L2') fail('2) row 101 after B\'s save ' + linked(101));
    // 3) B's own save of the card races a sync that asked before it
    const c3 = await aSends(['L3', 'F', 'G'], 102);
    await expandB(c3.b);
    await G.camOnCard(B, c3.b, 1);
    stale = { up0: ctl.uploads.length };
    const g3 = B.calls.filter(c => c.op === 'photoGet').length;
    await B.ev('(syncDay(), 1)');                     // the 30-s sync: its dayRows reads the sheet now
    await B.page.waitForTimeout(150);
    await B.page.click('#camDone');                    // B's save of the card runs meanwhile
    await L.waitFor(B, 'document.querySelector("#cam").hidden', 10000);
    await B.page.waitForTimeout(1500); await G.idle(B, 60000);
    await L.waitFor(B, '!picsLoading.size && !syncBusy', 20000); await G.idle(B);
    const s3 = await card(c3.b);
    await syncB();
    const s3b = await card(c3.b), g3n = B.calls.filter(c => c.op === 'photoGet').length - g3;
    if (s3.n !== 4 || s3b.n !== 4 || s3b.shapes !== '?,F,G,L3') fail('3) B\'s card after the race ' + JSON.stringify(s3) + ', after the next sync ' + JSON.stringify(s3b));
    if (g3n) fail(`3) the old links came back: ${g3n} photos loaded from Drive again`);
    if (linked(102) !== '?,F,G,L3') fail('3) row 102 ' + linked(102));
    // 4) a download still on its way when the row's links change: the copy of a link that is gone never stays
    const c4 = await aSends(['L4', 'H'], 103);
    ctl.photoGetMs = 1500;
    await B.ev(`(loadPics(S.boxes.get(${JSON.stringify(c4.b)})), 1)`);
    await B.page.waitForTimeout(400);
    await B.ev(`takePics(${JSON.stringify(c4.b)}, [{ id: 'NEWLINKxxxxxxxxxxxxxxxxxxxx', label: 'LABEL 1' }], Date.now()).then(() => 1)`);
    await L.waitFor(B, '!picsLoading.size', 20000);
    ctl.photoGetMs = 0;
    const left = await B.ev(`JSON.stringify({ n: S.boxes.get(${JSON.stringify(c4.b)}).photos.length, mem: [...S.photos.values()].filter(p => p.box === ${JSON.stringify(c4.b)}).length })`).then(JSON.parse);
    const stored = await B.page.evaluate(async id => {
      const d = await new Promise((res, rej) => { const r = indexedDB.open('intake'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const all = await new Promise(res => { const q = d.transaction('photos', 'readonly').objectStore('photos').getAll(); q.onsuccess = () => res(q.result); });
      d.close(); return all.filter(p => p.box === id).length;
    }, c4.b);
    if (left.n || left.mem || stored) fail('4) copies of links that are gone ' + JSON.stringify({ card: left.n, mem: left.mem, stored }));
    const errs = [...A.errs, ...B.errs].filter(e => !/Failed to load resource|ERR_FAILED/.test(e));
    if (errs.length) fail('page errors ' + JSON.stringify(errs));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { stale = null; await A.close(); await B.close(); }
  L.report(NAME, ok, why);
})();

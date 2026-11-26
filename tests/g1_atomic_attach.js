// F5: a photo and the box that lists it are saved together, and start-up repairs photos no box lists.
//  1) Photos stored with a box id but listed by no box (an app closed halfway through a save) come back at start-up:
//     into their unsent box (which is read again), into a box already in the sheet (its photos saved to Drive again),
//     or, when their box is gone, into "waiting to be sorted". (v37: shown nowhere, never read or uploaded.)
//  2) When the box can't be written, the photo isn't stored either, isn't shown, and the message is true.
//  3) A photo that arrives for a box deleted meanwhile waits to be sorted (v37: stored with the dead box id, invisible).
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'g1_atomic_attach';
const idbState = t => t.page.evaluate(async () => {
  const d = await new Promise((res, rej) => { const r = indexedDB.open('intake'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = s => new Promise(res => { const q = d.transaction(s, 'readonly').objectStore(s).getAll(); q.onsuccess = () => res(q.result); });
  const [ph, bx] = [await all('photos'), await all('boxes')]; d.close();
  const listed = new Set(bx.flatMap(b => b.photos));
  return { strays: ph.filter(p => p.box && !listed.has(p.id)).map(p => p.id), photos: ph.length };
});
(async () => {
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: L.makeBackend(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    await L.slowSaves(t);
    // box 1: label + item, sent; box 2: item only (held on Check: no label)
    await L.phonePhoto(t, 'L1'); await L.phonePhoto(t, 'A'); await t.page.click('#curFinish'); await L.waitIdle(t);
    await L.phonePhoto(t, 'B'); await t.page.click('#curFinish'); await L.waitIdle(t);
    let bx = await L.boxes(t);
    const [b1, b2] = bx;
    if (!b1 || !b1.sheetRow || !b2 || b2.sheetRow) throw new Error('setup: ' + JSON.stringify(bx.map(b => [b.seq, b.view])));
    // 1) three photos saved with a box id that no box lists
    const add = async (id, box, shape, dt) => {
      const b64 = (await L.jpeg(t.page, shape)).toString('base64');
      await t.ev(`(() => { const u = Uint8Array.from(atob(${JSON.stringify(b64)}), c => c.charCodeAt(0));
        return putPhoto({ id: ${JSON.stringify(id)}, t: Date.now() + ${dt}, blob: new Blob([u], { type: 'image/jpeg' }), w: 1000, h: ${Math.round(1000 * L.SHAPES[shape])}, split: false, box: ${JSON.stringify(box)}, kind: null, src: 'phone' }).then(() => 1); })()`);
    };
    await add('stray-c', b2.id, 'C', 1); await add('stray-d', b1.id, 'D', 2); await add('stray-e', 'a-box-that-is-gone', 'E', 3);
    await t.page.reload({ waitUntil: 'load' });
    await t.page.waitForFunction(() => typeof window.__ev === 'function');
    await L.slowSaves(t);                              // the reload dropped it
    await L.waitFor(t, 'allBoxes().length >= 2', 10000);
    await t.page.waitForTimeout(500);
    await L.waitIdle(t);
    bx = await L.boxes(t);
    const n1 = bx.find(b => b.id === b1.id), n2 = bx.find(b => b.id === b2.id);
    if (!n2 || n2.n !== 2 || !/CHARLIE LAMP/.test(n2.contents)) fail('unsent box did not get its photo back and read it: ' + JSON.stringify(n2 && [n2.n, n2.contents]));
    if (!n1 || n1.n !== 3) fail('box in the sheet did not get its photo back: ' + JSON.stringify(n1 && n1.n));
    const up = ctl.uploads.filter(u => u.row === b1.sheetRow).pop();
    if (!up || !up.who.includes('D')) fail('the returned photo was not saved to Drive with its box: ' + JSON.stringify(ctl.uploads));
    const pend = await t.ev('pendingPhotos().map(p => p.id).join(",")');
    if (pend !== 'stray-e') fail('photo of a deleted box not waiting to be sorted: ' + JSON.stringify(pend));
    // 2) the box can't be written (once): the photo must not be stored, nor shown, and the message says so
    await L.phonePhoto(t, 'L2');
    const cur = await t.ev('S.current');
    await t.page.evaluate(() => {
      window.__failBox = 1; const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (v, ...a) { if (window.__failBox > 0 && v && Array.isArray(v.photos)) { window.__failBox--; throw new DOMException('Write failed (test).', 'UnknownError'); } return put.call(this, v, ...a); };
    });
    const before = await L.photoCount(t);
    await L.phonePhoto(t, 'F', false);
    await L.waitFor(t, '!(S.saving > 0) && !document.querySelector("#notice").hidden', 10000);
    await t.page.waitForTimeout(600);
    const st = await idbState(t);
    if (st.strays.length) fail('a photo was stored that its box does not list: ' + JSON.stringify(st.strays));
    const mem = await t.ev(`JSON.stringify({ n: S.boxes.get(${JSON.stringify(cur)}).photos.length, size: S.photos.size })`).then(JSON.parse);
    if (mem.n !== 1 || mem.size !== before) fail('the photo that was not saved still shows: ' + JSON.stringify(mem));
    if (!/couldn’t be saved/.test(await t.page.textContent('#notice'))) fail('no message for the photo that was not saved');
    // 3) the box in progress is deleted while a photo for it is still saving
    await L.setSlow(t, 1200);
    await L.phonePhoto(t, 'G', false);
    await t.page.waitForTimeout(300);
    await t.ev('deleteBox(S.current), 1');
    await L.setSlow(t, 0);
    await L.waitFor(t, '!(S.saving > 0)', 10000); await t.page.waitForTimeout(1500);
    const pend2 = await t.ev('pendingPhotos().length');
    if (pend2 !== 2) fail(`photo for the deleted box is not waiting to be sorted (${pend2} waiting)`);
    if (t.errs.length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

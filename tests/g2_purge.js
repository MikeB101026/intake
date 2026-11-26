// F2, F3: Settings → "Delete photos of boxes already in the sheet" deletes only photos known to be in Drive and keeps
// (and counts) the rest; a box it cleared never has its AV–BJ rewritten without the cleared photos (a photo added later
// stays on this phone and the card says so); boxes cleared by the purge before this version are treated the same.
// (v37 deleted every photo of a box marked "linked": photos past the 15, photos added after the save, all of them.)
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'g2_purge';
(async () => {
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: G.makeBackend2(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    const day = G.daysAgo(8), old = Date.now() - 8 * 86400000, sent = old + 60000, SH = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const photos = [], boxes = [];
    const mk = (box, n, o = {}) => Array.from({ length: n }, (_, i) => { const id = `${box}${String(i).padStart(2, '0')}`; photos.push(Object.assign({ id, box, shape: i ? SH[i % 9] : 'L1', kind: i ? 'item' : 'label', src: 'camera', t: old + i * 1000 }, (o.ph || {})[i] || {})); return id; });
    const add = ({ extra, ...o }, n, po) => { const ids = mk(o.id, n, po); boxes.push(G.sentBox(Object.assign({ day, createdAt: old, sentAt: sent, photos: ids, photosLinked: true }, extra ? extra(ids) : {}, o))); return ids; };
    add({ id: 'A', sheetRow: 101, photosLinked: false, linkError: 'No connection', linkErrAt: Date.now(), extra: ids => ({ savedIds: ids.slice(0, 2) }) }, 3);   // not saved yet
    add({ id: 'B', sheetRow: 102, extra: ids => ({ savedIds: ids.slice(0, 15), photosLeft: 2 }) }, 17);   // 15 in Drive, 2 only here
    add({ id: 'C', sheetRow: 103 }, 3);                                                        // linked before this version
    add({ id: 'D', sheetRow: 104 }, 3, { ph: { 2: { t: sent + 300000 } } });                   // + a photo taken after it was sent
    add({ id: 'E', sheetRow: 105 }, 16);                                                       // linked before this version, 16 photos
    add({ id: 'F', sheetRow: 106, imported: true, extra: ids => ({ savedIds: ids.slice(), pics: [], picsDone: [] }) }, 3);   // another phone's, saved again here
    add({ id: 'G', sheetRow: 107, imported: true, extra: () => ({ pics: [{ id: 'pg0', label: 'LABEL 1' }, { id: 'pg1', label: 'INSIDE 1' }], picsDone: ['pg0', 'pg1'] }) }, 2, { ph: { 0: { src: 'drive' }, 1: { src: 'drive' } } });
    add({ id: 'H', sheetRow: 108, wrongRow: true, extra: ids => ({ savedIds: ids.slice() }) }, 2);   // an earlier day's row
    add({ id: 'I', sheetRow: 109, createdAt: Date.now(), extra: ids => ({ savedIds: ids.slice() }) }, 2);   // not 7 days old
    boxes.push(G.sentBox({ id: 'J', day, sheetRow: 110, createdAt: old, sentAt: sent, photos: [], photosLinked: true }));   // cleared by the old purge
    const kPics = await G.otherRow(t, ctl, { row: 111, day, cells: ['ANNA LEE', 'TBA444444444444', '1', '2', 'AMAZON', 'NO INVOICE', 'ALPHA SHOE (1 TOTAL)'], shapes: ['L4', 'A'] });
    boxes.push(G.sentBox({ id: 'K', day, sheetRow: 111, createdAt: old, sentAt: sent, photos: [], photosLinked: true, imported: true, pics: kPics, picsDone: kPics.map(p => p.id),
      row: { customer: 'ANNA LEE', tracking: 'TBA444444444444', weight: '2' } }));   // another phone's, cleared by the old purge
    for (const b of boxes) if (b.id !== 'K') ctl.sheet.rows.push(G.sheetRowFor(b, b.sheetRow));
    await G.inject(t, photos, boxes);
    ctl.offline = ['photos'];                          // A stays unsaved
    await G.reload(t);
    await L.waitFor(t, 'S.boxes.size === 11', 10000); await t.page.waitForTimeout(800); await G.idle(t);
    await t.page.click('#gearBtn'); await t.page.click('#purgeBtn');
    await L.waitFor(t, '/Deleted/.test(document.querySelector("#storeInfo").textContent)', 10000);
    const info = await t.page.textContent('#storeInfo');
    const st = await t.ev(`JSON.stringify(Object.fromEntries(allBoxes().map(b => [b.id, b.photos.filter(id => S.photos.has(id)).length])))`).then(JSON.parse);
    const want = { A: 3, B: 2, C: 0, D: 3, E: 16, F: 0, G: 0, H: 2, I: 2, J: 0, K: 0 };
    for (const k of Object.keys(want)) if (st[k] !== want[k]) fail(`box ${k}: ${st[k]} photos left, expected ${want[k]}`);
    if (!/Deleted 23 photos\. Kept 26 that aren’t saved to Drive\./.test(info)) fail('message: ' + info);
    const bLeft = (await G.box(t, 'B')).photos;
    if (JSON.stringify(bLeft) !== '["B15","B16"]') fail('B kept ' + JSON.stringify(bLeft));
    await t.page.click('#setClose');
    // a photo added later to a box the purge cleared (B, and J from the old purge): not sent, kept, and the card says so
    ctl.offline = false;
    const addPhoto = async (box, pid, shape) => {
      const b64 = (await L.jpeg(t.page, shape)).toString('base64');
      await t.ev(`(() => { const u = Uint8Array.from(atob(${JSON.stringify(b64)}), x => x.charCodeAt(0));
        const p = { id: ${JSON.stringify(pid)}, t: Date.now(), blob: new Blob([u], { type: 'image/jpeg' }), w: 1000, h: 480, split: false, box: null, kind: 'item', src: 'camera' };
        S.photos.set(p.id, p); return putPhoto(p).then(() => attachToBox(${JSON.stringify(box)}, [p])).then(() => 1); })()`);
    };
    await addPhoto('B', 'Bnew', 'E'); await addPhoto('J', 'Jnew', 'F'); await addPhoto('K', 'Knew', 'G');
    await t.page.waitForTimeout(1000); await G.idle(t);
    if (ctl.uploads.some(u => u.row === 102 || u.row === 110)) fail('a cleared box had its AV–BJ rewritten: ' + JSON.stringify(ctl.uploads.map(u => [u.row, u.who])));
    const uk = ctl.uploads.filter(u => u.row === 111).pop();
    if (!uk || JSON.stringify(uk.who.slice().sort()) !== '["A","G","L4"]') fail('another phone’s cleared box: its Drive photos not loaded before the save ' + JSON.stringify(uk && uk.who));
    await t.page.selectOption('#daySel', day);
    await G.expand(t, 'B');
    const txt = await G.cardText(t, 'B');
    if (!/PHOTOS ONLY ON THIS PHONE/.test(txt) || !/3 photos only on this phone — older photos of this box were already cleared/.test(txt)) fail('card B: ' + txt.slice(-260));
    await t.page.click('#gearBtn'); await t.page.click('#purgeBtn');
    await L.waitFor(t, '/Deleted 0 photos/.test(document.querySelector("#storeInfo").textContent)', 10000).catch(() => {});
    const st2 = await t.ev('S.boxes.get("B").photos.filter(id => S.photos.has(id)).length + "," + S.boxes.get("J").photos.filter(id => S.photos.has(id)).length');
    if (st2 !== '3,1') fail('second purge left B,J = ' + st2);
    await t.page.click('#setClose');
    // B turns out to sit on an earlier day's row: "Send as a new row" — the new row is empty, so it gets the 3 photos still here
    await t.ev('syncBusy = true, 1');
    await t.ev('patchBox("B", x => { x.wrongRow = true; }).then(() => 1)');
    await t.page.click('[data-id="B"] [data-act="resend"]');
    await L.waitFor(t, '!document.querySelector("#plan").hidden', 10000);
    await t.page.click('#planAll');
    await L.waitFor(t, 'S.boxes.get("B").sheetRow && S.boxes.get("B").sheetRow !== 102 && S.boxes.get("B").photosLinked', 10000).catch(() => {});
    const nb = await G.box(t, 'B'), ub = ctl.uploads.filter(u => u.row === nb.sheetRow).pop();
    if (!ub || ub.n !== 3 || ctl.uploads.some(u => u.row === 102)) fail('after Send as a new row ' + JSON.stringify({ row: nb.sheetRow, ups: ctl.uploads.map(u => [u.row, u.n]) }));
    if (t.errs.filter(e => !/Failed to load resource/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

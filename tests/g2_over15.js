// F3: a box with 17 photos (1 label + 16 inside). The sheet links 15: the card must say that 2 are only on this phone,
// and the purge must delete only the 15 that are in Drive. (v37: "photos linked in AV–BJ" and the purge deleted all 17.)
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'g2_over15';
(async () => {
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: G.makeBackend2(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    const shapes = ['L1', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const ids = shapes.map((s, i) => `p${String(i).padStart(2, '0')}`);
    const b = G.sentBox({ id: 'big', sheetRow: 100, createdAt: Date.now() - 8 * 86400000, sentAt: Date.now() - 8 * 86400000 + 60000, photos: ids });
    await G.inject(t, shapes.map((s, i) => ({ id: ids[i], shape: s, kind: i ? 'item' : 'label', src: 'camera', box: 'big', t: b.createdAt + i * 1000 })), [b]);
    ctl.sheet.rows.push(G.sheetRowFor(b, 100));
    await G.reload(t);                                 // start-up saves its photos (not saved yet)
    await L.waitFor(t, 'S.boxes.get("big") && S.boxes.get("big").photosLinked', 20000);
    await G.idle(t);
    const up = ctl.uploads.filter(u => u.row === 100).pop();
    if (!up || up.n !== 15) throw new Error('setup: uploads ' + JSON.stringify(ctl.uploads.map(u => u.n)));
    await G.expand(t, 'big');
    const txt = await G.cardText(t, 'big');
    if (!/2 more photos only on this phone/.test(txt)) fail('card does not say 2 photos are only on this phone: ' + txt.slice(-160));
    await t.page.click('#gearBtn'); await t.page.click('#purgeBtn');
    await L.waitFor(t, '/Deleted/.test(document.querySelector("#storeInfo").textContent)', 10000);
    const info = await t.page.textContent('#storeInfo'), left = (await G.box(t, 'big')).photos;
    const onPhone = await t.ev(`JSON.stringify(${JSON.stringify(ids)}.filter(id => S.photos.has(id)))`).then(JSON.parse);
    if (JSON.stringify(left) !== JSON.stringify(['p15', 'p16']) || JSON.stringify(onPhone) !== JSON.stringify(['p15', 'p16'])) fail('purge kept ' + JSON.stringify({ left, onPhone }));
    if (!/Deleted 15 photos\. Kept 2/.test(info)) fail('purge message: ' + info);
    // the IndexedDB copy agrees after a restart
    await G.reload(t);
    await L.waitFor(t, 'S.boxes.get("big")', 10000); await t.page.waitForTimeout(500);
    const after = await G.box(t, 'big'), n = await t.ev('S.photos.size');
    if (after.n !== 2 || n !== 2) fail('after restart ' + JSON.stringify({ photos: after.photos, n }));
    if (t.errs.length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

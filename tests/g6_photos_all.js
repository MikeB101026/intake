// F3 (app, backend v10): a box with 17 photos (1 label + 16 inside), already in the sheet, saves its photos. With backend
// v10 every photo goes to Drive: the app sends all 17 (labels first) — also on a phone that remembers the backend as v9
// from before it was updated — notes all 17 as saved, the card no longer says photos are only on this phone (it says
// where the 2 past the 15 links are), and the purge may clear all 17. With backend v9 (as deployed now) nothing
// changes: 15 go, 2 stay on the phone and the card says so. Both backends are backend/Code.gs itself, run in node
// (v10: this repo's; v9: commit 087d4d5's); the app is REPO's. (v37 app: 15 sent even to v10.)
const path = require('path');
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L, G6 = require('./lib_g6.js');
const NAME = 'g6_photos_all';
const SHAPES = ['L1', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
async function phase(v, rememberV9) {
  const day = G.today();
  const be = G6.loadBackend(v === 10 ? { file: require('path').resolve(__dirname, '..', 'backend', 'Code.gs'), props: { NEXT_ROW: '101', LAST_SEP: JSON.stringify({ row: 99, day }) } }
    : { src: G6.v9src(), props: { NEXT_ROW: '101', LAST_SEP: JSON.stringify({ row: 99, day }) } });
  if (be.version !== v) throw new Error('setup: backend says v' + be.version);
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: G6.harnessBackend(be, ctl) });
  const out = { v, errs: [] };
  try {
    await t.page.waitForTimeout(400);
    const ids = SHAPES.map((s, i) => `p${String(i).padStart(2, '0')}`);
    const b = G.sentBox({ id: 'big', sheetRow: 100, createdAt: Date.now() - 8 * 86400000, sentAt: Date.now() - 8 * 86400000 + 60000, photos: ids });
    G6.sepRow(be.sh, 99, day);
    G6.boxRow(be.sh, 100, day, b.sentCells.slice(0, 7));
    await G.inject(t, SHAPES.map((s, i) => ({ id: ids[i], shape: s, kind: i ? 'item' : 'label', src: 'camera', box: 'big', t: b.createdAt + i * 1000 })), [b]);
    if (rememberV9) await t.page.evaluate(() => localStorage.setItem('bv3:https://backend.test/exec', '9'));   // asked before the update
    await G.reload(t);                                 // start-up saves its photos (not saved yet)
    await L.waitFor(t, 'S.boxes.get("big") && S.boxes.get("big").photosLinked', 20000);
    await G.idle(t);
    const sends = ctl.bodies.filter(x => x.op === 'photos');
    out.sent = sends.map(x => x.photos.length);
    out.labels = sends.length ? sends[sends.length - 1].photos.map(p => p.label) : [];
    out.files = be.drive.files.size;
    out.box = await G.box(t, 'big');
    await G.expand(t, 'big');
    out.card = await G.cardText(t, 'big');
    await t.page.click('#gearBtn'); await t.page.click('#purgeBtn');
    await L.waitFor(t, '/Deleted/.test(document.querySelector("#storeInfo").textContent)', 10000);
    out.purge = await t.page.textContent('#storeInfo');
    out.left = (await G.box(t, 'big')).photos.length;
    out.errs = t.errs.filter(e => !/Failed to load resource|net::ERR_FAILED/.test(e));
  } finally { await t.close(); }
  return out;
}
(async () => {
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    // Backend v10, on a phone that remembers v9 from before the update.
    const a = await phase(10, true);
    if (JSON.stringify(a.sent) !== '[17]') fail('v10: photos sent per save ' + JSON.stringify(a.sent));
    if (a.labels[0] !== 'LABEL 1' || a.labels[16] !== 'INSIDE 16') fail('v10: order ' + a.labels.join(','));
    if (a.files !== 17) fail('v10: ' + a.files + ' files in Drive');
    if (!a.box.savedIds || a.box.savedIds.length !== 17 || a.box.left !== 0) fail('v10: savedIds ' + (a.box.savedIds || []).length + ', photosLeft ' + a.box.left);
    if (/only on this phone/.test(a.card)) fail('v10: card still says photos are only on this phone: ' + a.card.slice(-170));
    if (!/2 more in the Drive photo folder/.test(a.card)) fail('v10: card doesn’t say where the 2 past the links are: ' + a.card.slice(-170));
    if (!/Deleted 17 photos\.$/.test(a.purge.trim()) || a.left !== 0) fail('v10: purge ' + a.purge + ' left ' + a.left);
    if (a.errs.length) fail('v10: page errors ' + a.errs.join(' | '));
    // Backend v9 (deployed now): as before.
    const b = await phase(9, false);
    if (JSON.stringify(b.sent) !== '[15]' || b.files !== 15) fail('v9: sent ' + JSON.stringify(b.sent) + ', files ' + b.files);
    if (!b.box.savedIds || b.box.savedIds.length !== 15 || b.box.left !== 2) fail('v9: savedIds ' + (b.box.savedIds || []).length + ', photosLeft ' + b.box.left);
    if (!/2 more photos only on this phone \(the sheet links 15\)/.test(b.card)) fail('v9: card ' + b.card.slice(-170));
    if (!/Deleted 15 photos\. Kept 2/.test(b.purge) || b.left !== 2) fail('v9: purge ' + b.purge + ' left ' + b.left);
    if (b.errs.length) fail('v9: page errors ' + b.errs.join(' | '));
  } catch (e) { fail('exception ' + (e.stack || e.message)); }
  G6.report(NAME, ok, why);
})();

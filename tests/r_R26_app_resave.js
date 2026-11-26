// R26 (app + backend v10): box X (row 101, this phone, 20 photos) saves its photos at start-up. While the backend makes
// its 17th Drive file, the office deletes a repeated row (99) above it by hand, so row 101 now holds another phone's box
// Z. The save must not put X's links over Z's: it fails with "Sheet row 101 no longer holds this box.", the next sync
// moves X to its row (100) and the photos are saved there. In the end X's row links X's photos, Z's row keeps Z's own
// link (and Z's card here never takes X's photos), and X's card says its photos are linked. The app and backend/Code.gs
// (run in node) are REPO's. (Before: X's links went over Z's row 101, X was marked saved, and X's own row had none.)
const path = require('path');
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L, G6 = require('./lib_g6.js');
const NAME = 'r_R26_app_resave';
const PORT = +process.env.PORT || 10820;
const FOLDER = '1LVsQwAzpHMGiKzrJL0Cw1Q-l9LkalZ-w';
(async () => {
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const day = G.today(), yday = G.daysAgo(1);
  const be = G6.loadBackend({ file: path.join(process.env.REPO || require('path').resolve(__dirname, '..'), 'backend/Code.gs'), props: { NEXT_ROW: '103', LAST_SEP: JSON.stringify({ row: 100, day }) } });
  const SH = ['L1', 'L2', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  const ids = SH.map((s, i) => `x${String(i).padStart(2, '0')}`);
  const X = G.sentBox({ id: 'boxX', sheetRow: 101, photos: ids, seq: 1, row: { customer: 'BOX X', tracking: '1Z999AA10123456784', weight: '3', shipper: 'UPS', contents: 'X THING (1 TOTAL)' } });
  G6.sepRow(be.sh, 97, yday);
  G6.boxRow(be.sh, 98, yday, ['W OLD', '1Z999AA10000000001', '1', '2', 'UPS', 'NO INVOICE', 'W (1 TOTAL)']);
  G6.boxRow(be.sh, 99, yday, ['W OLD', '1Z999AA10000000001', '1', '2', 'UPS', 'NO INVOICE', 'W (1 TOTAL)']);   // the repeat the office deletes
  G6.sepRow(be.sh, 100, day);
  G6.boxRow(be.sh, 101, day, X.sentCells.slice(0, 7));
  const zId = be.drive.getFolderById(FOLDER).createFile({ name: 'z.jpg', bytes: [] }).getId();
  G6.boxRow(be.sh, 102, day, ['BOX Z', '1Z999AA10123456785', '1', '3', 'UPS', 'NO INVOICE', 'Z THING (1 TOTAL)'], [{ id: zId, label: 'LABEL 1' }]);
  const xFiles = new Set(), replies = [];
  let inPhotos = false, nFile = 0, deleted = false;
  const getFolder = be.drive.getFolderById;
  be.ctx.DriveApp.getFolderById = id => {
    const f = getFolder(id), cf = f.createFile;
    f.createFile = b => { const h = cf(b); if (inPhotos) { xFiles.add(h.getId()); if (++nFile === 17 && !deleted) { deleted = true; be.sh.deleteRows(99, 1); } } return h; };
    return f;
  };
  const ctl = { ops: [] }, claude = L.makeBackend(ctl);
  let t;
  const backend = async (op, body, calls) => {
    ctl.ops.push(op);
    if (op === 'claude' || op === 'warm') return claude(op, body, calls);
    if (op === 'photoGet') { const f = be.drive.files.get(String(body.id)); if (f && !f.bytes.length) return { b64: (await L.jpeg(t.page, 'L3')).toString('base64') }; }
    await L.sleep(30);
    if (op === 'photos') { inPhotos = true; nFile = 0; }
    let out;
    try { out = be.call(body); } finally { inPhotos = false; }
    if (op === 'photos') replies.push({ row: body.row, sent: body.photos.length, error: out.error || '' });
    return out;
  };
  t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend });
  try {
    await t.page.waitForTimeout(400);
    await G.inject(t, SH.map((s, i) => ({ id: ids[i], shape: s, kind: /^L/.test(s) ? 'label' : 'item', src: 'camera', box: 'boxX', t: X.createdAt + i * 1000 })), [X]);
    await G.reload(t);                                  // start-up saves X's photos
    await L.waitFor(t, 'S.boxes.get("boxX") && (S.boxes.get("boxX").photosLinked || S.boxes.get("boxX").linkError)', 90000);
    if (!deleted) throw new Error('setup: the row was not deleted during the save ' + JSON.stringify(replies));
    // The 30-s sync (called here so the test doesn't wait): X follows its tracking to row 100 and is saved there.
    await t.ev('syncDay()');
    await L.waitFor(t, 'S.boxes.get("boxX").photosLinked && +S.boxes.get("boxX").sheetRow === 100', 60000).catch(() => {});
    await G.idle(t, 60000).catch(() => {});
    await t.ev('syncDay()'); await G.idle(t, 60000).catch(() => {});
    const xb = await G.box(t, 'boxX');
    const av = r => be.sh.getRange(r, 48, 1, 15).getFormulas()[0].filter(Boolean).map(f => (f.match(/\/d\/([\w-]+)/) || [])[1]);
    const xRow = be.sh.findRows(c => c[0] === 'BOX X')[0], zRow = be.sh.findRows(c => c[0] === 'BOX Z')[0];
    if (process.env.VERBOSE) console.log(JSON.stringify({ replies, xb, xRow, zRow, xAv: av(xRow), zAv: av(zRow) }));
    if (xRow !== 100 || zRow !== 101) throw new Error(`setup: X on ${xRow}, Z on ${zRow}`);
    if (av(zRow).some(id => xFiles.has(id))) fail(`Z's row ${zRow} holds X's links`);
    if (!av(zRow).includes(zId)) fail(`Z's row lost its own link: ${JSON.stringify(av(zRow))}`);
    if (av(xRow).length !== 15 || !av(xRow).every(id => xFiles.has(id))) fail(`X's row ${xRow} links ${av(xRow).length} of X's photos`);
    if (xb.sheetRow !== 100 || !xb.linked || xb.linkError) fail('X’s card: ' + JSON.stringify({ sheetRow: xb.sheetRow, linked: xb.linked, err: xb.linkError }));
    const zCards = await t.ev(`JSON.stringify(allBoxes().filter(b => b.row.customer === 'BOX Z').map(b => (b.pics || []).map(p => p.id)))`).then(JSON.parse);
    if (zCards.some(p => p.some(id => xFiles.has(id)))) fail('Z’s card on this phone took X’s photos: ' + JSON.stringify(zCards));
    if (replies.length > 6) fail(`${replies.length} photo saves (expected a few, no loop)`);
    const errs = t.errs.filter(e => !/Failed to load resource|net::ERR_FAILED/.test(e));
    if (errs.length) fail('page errors ' + JSON.stringify(errs));
  } catch (e) { fail('exception ' + String(e.stack || e.message).split('\n').slice(0, 3).join(' ')); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

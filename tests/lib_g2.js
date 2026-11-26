// Helpers for the G2 tests (not a test itself). lib_g1's fake backend and fake Claude, plus a faithful photo save
// (Code.gs savePhotos_: refuses when the row's tracking isn't expectTracking, writes exactly the photos sent (max 15) into
// AV–BJ, returns Drive links), Drive files that photoGet hands out, update's tracking check, and an outage switch.
const L = require('./lib_g1.js');
const alnum = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const disp = day => { const [y, m, d] = day.split('-'); return `${d} ${MON[+m - 1]} ${y}`; };
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => dayKey(new Date());
const daysAgo = n => dayKey(new Date(Date.now() - n * 86400000));
// ctl (besides lib_g1's): offline: true | [ops] (those requests never arrive), photosHook(body, n) awaited before a save
// ('ABORT': that save is lost on the way), appendHook(body) awaited before a row write,
// photoGetFail(id) -> true: that Drive file can't be loaded. Records: ctl.uploads [{row, who, labels, expect}],
// ctl.photoCalls (every photos request that arrived), ctl.rejects, ctl.drive Map(fileId -> {b64, label}).
function makeBackend2(ctl = {}) {
  ctl.sheet = ctl.sheet || { rows: [], next: 100 };
  ctl.drive = ctl.drive || new Map(); ctl.uploads = ctl.uploads || []; ctl.rejects = ctl.rejects || []; ctl.photoCalls = ctl.photoCalls || 0;
  const base = L.makeBackend(ctl);
  let fileN = 0;
  return async (op, body, calls) => {
    if (ctl.offline && (ctl.offline === true || ctl.offline.includes(op))) return 'ABORT';
    if (op === 'append' && ctl.appendHook) await ctl.appendHook(body);
    const sh = ctl.sheet;
    if (op === 'photos') {
      const n = ++ctl.photoCalls;
      if (ctl.photosHook) { const r = await ctl.photosHook(body, n); if (r === 'ABORT') return 'ABORT'; }
      await L.sleep(ctl.photosMs || 150);
      const row = sh.rows.find(r => r.row === +body.row);
      if (!row || alnum(row.cells[1]) !== alnum(body.expectTracking)) { ctl.rejects.push({ row: +body.row, expect: body.expectTracking }); return { error: 'Sheet row ' + body.row + ' no longer holds this box.' }; }
      const photos = (body.photos || []).slice(0, 15);
      if (!photos.length) return { links: [] };
      const links = photos.map(p => {
        const id = 'F' + String(++fileN).padStart(5, '0') + 'drivefileidxxxxxxxxxxxxxx';
        ctl.drive.set(id, { b64: p.b64, label: p.label });
        return { label: p.label, url: `https://drive.google.com/file/d/${id}/view?usp=drivesdk`, id };
      });
      row.pics = links.map(l => ({ id: l.id, label: l.label }));
      ctl.uploads.push({ row: +body.row, who: photos.map(p => L.idOf(p.b64)), labels: photos.map(p => p.label), expect: body.expectTracking, n: photos.length });
      return { links: links.map(l => ({ label: l.label, url: l.url })) };
    }
    if (op === 'photoGet') {
      await L.sleep(ctl.photoGetMs || 80);
      if (ctl.photoGetFail && ctl.photoGetFail(body.id)) return { error: 'Not an intake photo.' };
      const f = ctl.drive.get(String(body.id));
      return f ? { b64: f.b64 } : { error: 'Not found (test).' };
    }
    if (op === 'update') {
      const r = sh.rows.find(x => x.row === +body.row);
      if (!r || alnum(r.cells[1]) !== alnum(body.expectTracking)) return { error: 'Sheet row ' + body.row + ' no longer holds this box. Fix it by hand.' };
      r.cells = body.cells.slice(0, 7); return { ok: true };
    }
    return base(op, body, calls);
  };
}
// Another phone's row: in the sheet with its photos in Drive (shapes from lib_g1, e.g. ['L4', 'A']).
async function otherRow(t, ctl, { row, day, cells, shapes }) {
  const pics = [];
  for (let i = 0; i < shapes.length; i++) {
    const id = `OTHER${row}x${i}xxxxxxxxxxxxxxxxxxxxxx`, lab = /^L/.test(shapes[i]);
    ctl.drive.set(id, { b64: (await L.jpeg(t.page, shapes[i])).toString('base64'), label: lab ? 'LABEL 1' : `INSIDE ${i}` });
    pics.push({ id, label: lab ? 'LABEL 1' : `INSIDE ${i}` });
  }
  ctl.sheet.rows.push({ row, day: day || today(), cells, pics });
  return pics;
}
// Writes photos (JPEGs of lib_g1 shapes) and boxes straight into the app's storage; reload() then boots with them.
// photos: [{ id, shape, kind, src, t, box }]; boxes: full box records.
async function inject(t, photos, boxes) {
  const ph = [];
  for (const p of photos) ph.push(Object.assign({}, p, { b64: (await L.jpeg(t.page, p.shape)).toString('base64'), h: Math.round(1000 * L.SHAPES[p.shape]) }));
  await t.page.evaluate(async ([ph, bx]) => {
    const d = await new Promise((res, rej) => { const r = indexedDB.open('intake', 1); r.onupgradeneeded = () => { r.result.createObjectStore('photos', { keyPath: 'id' }); r.result.createObjectStore('boxes', { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const tx = d.transaction(['photos', 'boxes'], 'readwrite');
      for (const p of ph) {
        const u = Uint8Array.from(atob(p.b64), c => c.charCodeAt(0));
        tx.objectStore('photos').put({ id: p.id, t: p.t || Date.now(), blob: new Blob([u], { type: 'image/jpeg' }), w: 1000, h: p.h, split: false, box: p.box, kind: p.kind || null, src: p.src || 'camera' });
      }
      for (const b of bx) tx.objectStore('boxes').put(b);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    d.close();
  }, [ph, boxes]);
}
// A box record as the app keeps it, already in the sheet (override any field).
function sentBox(o) {
  const row = Object.assign({ customer: 'JOHN SMITH', tracking: 'TBA111111111111', pieces: 1, weight: '4', shipper: 'AMAZON', invoice: false, contents: 'ALPHA SHOE (1 TOTAL)' }, o.row || {});
  const day = o.day || today();
  const sentCells = [row.customer, row.tracking, '1', String(row.weight), row.shipper, row.invoice ? 'INVOICE INCLUDED' : 'NO INVOICE', row.contents, disp(day)];
  return Object.assign({ day, seq: 1, createdAt: Date.now(), note: '', status: 'sent', proof: [], flags: [], badges: [], read: null, readError: '', edited: {}, ok: false,
    sentCells, sentAt: Date.now(), trk4s: [], noTotals: false, photosLinked: false }, o, { row, day });
}
const sheetRowFor = (b, rowNo) => ({ row: rowNo, day: b.day, cells: b.sentCells.slice(0, 7), pics: [] });
async function reload(t) {
  await t.page.reload({ waitUntil: 'load' });
  await t.page.waitForFunction(() => typeof window.__ev === 'function');
}
const box = (t, id) => t.ev(`JSON.stringify((b => b && { photos: b.photos, n: b.photos.length, linked: !!b.photosLinked, savedIds: b.savedIds || null, left: b.photosLeft, sheetRow: b.sheetRow, linkError: b.linkError || '', linkErrAt: b.linkErrAt || 0, purged: b.purged || null, pics: b.pics || null, picsDone: b.picsDone || null, view: viewStatus(b), tracking: b.row.tracking })(S.boxes.get(${JSON.stringify(id)})))`).then(JSON.parse);
const cardText = (t, id) => t.page.evaluate(id => { const el = document.querySelector(`[data-id="${CSS.escape(id)}"]`); return el ? el.textContent.replace(/\s+/g, ' ') : ''; }, id);
async function expand(t, id) {
  const ex = await t.ev(`S.expanded.has(${JSON.stringify(id)})`);
  if (!ex) await t.page.click(`[data-id="${id}"] [data-act="toggle"]`);
}
// A shot with QUICK CAM opened from the card's "+ Camera".
async function camOnCard(t, id, shots) {
  await expand(t, id);
  await t.page.click(`[data-id="${id}"] [data-act="cam"]`);
  await L.waitFor(t, 'CAM.stream && document.querySelector("#video").videoWidth > 0', 15000);
  const n0 = await t.ev(`S.boxes.get(${JSON.stringify(id)}).photos.length`);
  for (let i = 0; i < shots; i++) { await t.page.click('#shutter'); await t.page.waitForTimeout(120); }
  await L.waitFor(t, `S.boxes.get(${JSON.stringify(id)}).photos.length === ${n0 + shots}`, 15000);
}
// Nothing reading, sending, saving photos or uploading.
const IDLE2 = L.IDLE + ' && !LINK.q.length && !S.linking';
async function idle(t, timeout = 30000) { await L.waitFor(t, IDLE2, timeout); await t.page.waitForTimeout(300); await L.waitFor(t, IDLE2, timeout); }
module.exports = { L, makeBackend2, otherRow, inject, sentBox, sheetRowFor, reload, box, cardText, expand, camOnCard, idle, today, daysAgo, disp, alnum };

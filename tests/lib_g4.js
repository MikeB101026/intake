// Helpers for the G4 tests (not a test itself): a fake Apps Script backend that keeps the shared sheet the way Code.gs
// does — rows by number (a row deleted or inserted by hand moves every row below it, links included), the repeat check
// that reports a tracking's LATEST row (alnum, 8+ characters), dayRows with its look-back (and "from" when asked to act
// as v10), update and photo saves checked against column B — plus lib_g1's fake Claude and boxes written straight into
// the app's storage.
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const G2 = require('./lib_g2.js');
const alnum = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const caps = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toUpperCase();
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const disp = day => { const [y, m, d] = day.split('-'); return `${+d} ${MON[+m - 1][0]}${MON[+m - 1].slice(1).toLowerCase()} ${y}`; };   // the sheet shows "26 Nov 2026"
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dayKey(new Date());
const daysAgo = n => dayKey(new Date(Date.now() - n * 86400000));
// A–G as the sheet shows them after Code.gs wrote them (caps, pieces and weight as numbers).
const shown = c => { const w = c[3] === '' || c[3] == null || isNaN(Number(c[3])) ? String(c[3] || '') : String(Number(c[3])); return [caps(c[0]), String(c[1] || ''), String(Number(c[2]) || 1), w, caps(c[4]), String(c[5] || ''), String(c[6] || '')]; };
// ctl: v (backend version, 9), window (dayRows looks back this many rows; 500 like Code.gs), sendFrom (reply carries
// "from", as v10 will), lose {op: n} (done, then the answer is lost), fail [ops] (never arrive), gate {op: promise}
// (awaited before the op), delay {op: ms}, hook(op, body) (awaited first; 'ABORT' loses it). Records ctl.ops (every op
// that arrived), ctl.writes (append/update bodies that wrote), ctl.uploads ({row, n}).
function makeBackend4(ctl = {}) {
  ctl.sheet = ctl.sheet || new Map();              // row → { day, cells: [A..G], pics: [{id, label}] }
  ctl.ops = []; ctl.writes = []; ctl.uploads = []; ctl.drive = ctl.drive || new Map(); ctl.lose = ctl.lose || {}; ctl.delay = ctl.delay || {};
  const claude = L.makeBackend(ctl);
  let fileN = 0;
  const end = () => Math.max(ctl.start || 99, ...ctl.sheet.keys());
  const ops = {
    ping: () => ({ ok: true, v: ctl.v || 9, nextRow: end() + 1, model: 'm', fastModel: 'f', tab: 'T', hasKey: true }),
    warm: () => ({ ok: true }), watch: () => ({ names: [] }), printAdd: () => ({ ok: true, printerOnline: true }),
    dayRows: body => {
      const e = end(), from = Math.max(2, e - (ctl.window || 500)), to = e + 50;
      const rows = [...ctl.sheet.entries()].filter(([n, r]) => n >= from && n <= to && r.day === body.day).sort((a, b) => a[0] - b[0])
        .map(([n, r]) => ({ row: n, cells: [...r.cells, disp(r.day)], pics: r.pics.slice() }));
      return ctl.sendFrom ? { rows, from } : { rows };
    },
    append: body => {
      const rows = body.rows || [], e = end();
      if (body.checkDupes) {
        const seen = {};
        for (const [n, r] of [...ctl.sheet.entries()].sort((a, b) => a[0] - b[0])) if (n >= e - 3000) { const t = alnum(r.cells[1]); if (t.length >= 8) seen[t] = n; }
        const hits = {}; rows.forEach(r => { const k = alnum(r.cells[1]); if (seen[k]) hits[r.cells[1]] = seen[k]; });
        if (Object.keys(hits).length) return { dupes: hits, placed: [] };
      }
      let n = e; const placed = rows.map(g => { n++; ctl.sheet.set(n, { day: g.day, cells: shown(g.cells), pics: [] }); return { id: g.id, row: n }; });
      ctl.writes.push({ op: 'append', rows: placed.map(p => p.row) });
      return { placed, nextRow: n + 1 };
    },
    dupes: body => ({ hits: {} }),
    update: body => {
      const r = ctl.sheet.get(+body.row);
      if (!r || alnum(r.cells[1]) !== alnum(body.expectTracking)) return { error: 'Sheet row ' + body.row + ' no longer holds this box. Fix it by hand.' };
      r.cells = shown(body.cells); ctl.writes.push({ op: 'update', row: +body.row, cells: r.cells.slice() });
      return { ok: true };
    },
    photos: body => {
      const r = ctl.sheet.get(+body.row);
      if (!r || alnum(r.cells[1]) !== alnum(body.expectTracking)) return { error: 'Sheet row ' + body.row + ' no longer holds this box.' };
      const photos = (body.photos || []).slice(0, 15); if (!photos.length) return { links: [] };
      const links = photos.map(p => { const id = 'G4F' + String(++fileN).padStart(5, '0') + 'xxxxxxxxxxxxxxxxxxxx'; ctl.drive.set(id, { b64: p.b64, label: p.label }); return { id, label: p.label }; });
      r.pics = links.map(l => ({ id: l.id, label: l.label })); ctl.uploads.push({ row: +body.row, n: links.length, ids: links.map(l => l.id) });
      return { links: links.map(l => ({ label: l.label, url: `https://drive.google.com/file/d/${l.id}/view` })) };
    },
    photoGet: body => { const f = ctl.drive.get(String(body.id)); return f ? { b64: f.b64 } : { error: 'Not found (test).' }; },
  };
  return async (op, body, calls) => {
    ctl.ops.push(op);
    if (ctl.hook) { const r = await ctl.hook(op, body); if (r === 'ABORT') return 'ABORT'; }
    if ((ctl.fail || []).includes(op)) return 'ABORT';
    if (ctl.gate && ctl.gate[op]) await ctl.gate[op];
    await L.sleep(ctl.delay[op] != null ? ctl.delay[op] : op === 'claude' ? 0 : 60);
    if (op === 'claude') return claude(op, body, calls);
    const out = ops[op] ? ops[op](body) : { error: 'Unknown request.' };
    if (ctl.lose[op] > 0 && !out.error) { ctl.lose[op]--; return 'ABORT'; }
    return out;
  };
}
// The sheet as an office worker edits it: a whole row deleted, or a blank row inserted (rows below move, links too).
function deleteRow(ctl, n) {
  const next = new Map();
  for (const [k, r] of ctl.sheet) { if (k < n) next.set(k, r); else if (k > n) next.set(k - 1, r); }
  ctl.sheet = next;
}
function insertRow(ctl, n, r) {
  const next = new Map();
  for (const [k, x] of ctl.sheet) next.set(k >= n ? k + 1 : k, x);
  if (r) next.set(n, r);
  ctl.sheet = next;
}
const sheetRow = (day, cells, pics) => ({ day, cells: shown(cells), pics: pics || [] });
const cellsOf = (row) => [row.customer, row.tracking, '1', String(row.weight), row.shipper || 'AMAZON', row.invoice ? 'INVOICE INCLUDED' : 'NO INVOICE', row.contents || ''];
// A box that read clean and waits to be sent (override any field), with a label photo and one inside photo.
function readyBox(o) {
  const row = Object.assign({ customer: 'JOHN SMITH', tracking: 'TBA111111111111', pieces: 1, weight: '4', shipper: 'AMAZON', invoice: false, contents: 'ALPHA SHOE (1 TOTAL)' }, o.row || {});
  return Object.assign({ day: today(), seq: 1, createdAt: Date.now() - 60000, note: '', status: 'read', ok: true, proof: [{ line: row.contents, photos: [] }], flags: [], badges: [],
    read: { at: Date.now() - 50000, effort: 'medium', verify: { match: true, by: 'barcode' } }, readError: '', edited: {}, sheetRow: null, sentCells: null, trk4s: [], noTotals: false }, o, { row });
}
// Writes boxes (each with a label photo shape and an inside photo shape) into the app's storage and boots the app on them.
async function seed(t, boxes, shapes = ['L1', 'A']) {
  const photos = [];
  for (const b of boxes) {
    b.photos = b.photos || [];
    if (!b.photos.length) (b._shapes || shapes).forEach((s, i) => { const id = `${b.id}p${i}`; photos.push({ id, shape: s, kind: /^L/.test(s) ? 'label' : 'item', box: b.id, t: Date.now() - 55000 }); b.photos.push(id); });
    delete b._shapes;
  }
  await G2.inject(t, photos, boxes);
  await reload(t);
}
async function reload(t) {
  await t.page.reload({ waitUntil: 'load' });
  await t.page.waitForFunction(() => typeof window.__ev === 'function');
  await L.waitFor(t, 'PACE.ready || PACE.off', 15000);
  await idle(t);                                     // its start-up sync is done
}
const setLs = (t, kv) => t.page.evaluate(kv => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); }, kv);
const box = (t, id) => t.ev(`JSON.stringify((b => b && { id: b.id, seq: b.seq, day: b.day, row: b.row, sheetRow: b.sheetRow, sentCells: b.sentCells, view: viewStatus(b), wrongRow: !!b.wrongRow, imported: !!b.imported,
  edited: b.edited, sendTry: b.sendTry || null, linked: !!b.photosLinked, reasons: reasons(b) })(S.boxes.get(${JSON.stringify(id)})))`).then(JSON.parse);
const boxes = t => t.ev(`JSON.stringify(allBoxes().sort((a, c) => a.day.localeCompare(c.day) || a.seq - c.seq).map(b => ({ id: b.id, seq: b.seq, day: b.day, customer: b.row.customer, tracking: b.row.tracking, weight: b.row.weight, sheetRow: b.sheetRow, view: viewStatus(b), imported: !!b.imported, wrongRow: !!b.wrongRow })))`).then(JSON.parse);
const noticeText = t => t.ev('document.querySelector("#notice").hidden ? "" : document.querySelector("#notice").textContent');
const pageErrors = t => t.errs.filter(e => !/Failed to load resource|net::ERR_FAILED/.test(e));
const rowsWith = (ctl, trk) => [...ctl.sheet.entries()].filter(([n, r]) => alnum(r.cells[1]) === alnum(trk)).map(([n]) => n);
// Nothing reading, sending, syncing or saving photos.
const IDLE4 = L.IDLE + ' && !LINK.q.length && !S.linking && !syncBusy';
async function idle(t, timeout = 30000) { await L.waitFor(t, IDLE4, timeout); await t.page.waitForTimeout(250); await L.waitFor(t, IDLE4, timeout); }
async function begin(ctl, opts = {}) {
  const t = await start(Object.assign({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: makeBackend4(ctl) }, opts));
  await L.waitFor(t, 'PACE.ready || PACE.off', 15000);
  await idle(t);                                     // its start-up sync is done before a test puts rows in the sheet
  return t;
}
module.exports = { L, G2, start, begin, makeBackend4, deleteRow, insertRow, sheetRow, cellsOf, readyBox, seed, reload, setLs, box, boxes, noticeText, pageErrors, rowsWith, idle, today, daysAgo, disp, alnum, caps, shown };

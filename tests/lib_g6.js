// Helpers for the G6 tests (not a test itself): backend/Code.gs itself, run in node against fakes of the Apps Script
// services it uses — a spreadsheet (A1 ranges, display values with dates as the sheet shows them, formulas, rows
// inserted or deleted by hand moving every row below them and named ranges with them), CacheService, LockService,
// script properties, DriveApp (one photo folder), Utilities and ContentService. Also a backend for the Playwright
// harness (h.js) that answers every request with that Code.gs, except Claude's (lib_g1's fake Claude).
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isDate = v => Object.prototype.toString.call(v) === '[object Date]';
const colNum = s => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const signed = bytes => Array.from(bytes).map(b => (b > 127 ? b - 256 : b));
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dayKey(new Date());
const daysAgo = n => dayKey(new Date(Date.now() - n * 86400000));
const dateOf = day => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const shownDay = day => { const d = dateOf(day); return `${d.getDate()} ${MONS[d.getMonth()]} ${d.getFullYear()}`; };

class Range {
  constructor(sh, r, c, nr, nc) {
    if (!(nr >= 1) || !(nc >= 1)) throw new Error('The number of rows in the range must be at least 1.');
    Object.assign(this, { sh, r, c, nr, nc });
  }
  getRow() { return this.r; }
  getColumn() { return this.c; }
  getNumRows() { return this.nr; }
  getNumColumns() { return this.nc; }
  getSheet() { return this.sh; }
  getA1Notation() { return colName(this.c) + this.r + (this.nr > 1 || this.nc > 1 ? ':' + colName(this.c + this.nc - 1) + (this.r + this.nr - 1) : ''); }
  grid(f) { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(f(this.r + i, this.c + j)); o.push(row); } return o; }
  getDisplayValues() { this.sh.reads.push([this.r, this.nr]); return this.grid((r, c) => this.sh.disp(r, c)); }
  getDisplayValue() { return this.sh.disp(this.r, this.c); }
  getFormulas() { return this.grid((r, c) => { const v = this.sh.get(r, c); return typeof v === 'string' && v.startsWith('=') ? v : ''; }); }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some(row => row.length !== this.nc)) throw new Error('The number of rows or columns in the data does not match the range.');
    vals.forEach((row, i) => row.forEach((v, j) => this.sh.set(this.r + i, this.c + j, v)));
    this.sh.writes.push([this.r, this.c, this.nr, this.nc]);
    return this;
  }
  setNumberFormat() { return this; }
}
class Sheet {
  constructor(name, ss) { this.name = name; this.ss = ss; this.rows = new Map(); this.reads = []; this.writes = []; }
  get(r, c) { const row = this.rows.get(r); return row ? row.get(c) : undefined; }
  set(r, c, v) { let row = this.rows.get(r); if (!row) this.rows.set(r, (row = new Map())); if (v === '' || v == null) row.delete(c); else row.set(c, v); }
  disp(r, c) {
    const v = this.get(r, c);
    if (v == null) return '';
    if (isDate(v)) return `${v.getDate()} ${MONS[v.getMonth()]} ${v.getFullYear()}`;    // the 'd mmm yyyy' format
    if (typeof v === 'string' && v.startsWith('=')) { const m = v.match(/^=HYPERLINK\("[^"]*","([^"]*)"\)$/); return m ? m[1] : v; }
    return String(v);
  }
  getRange(a, b, nr, nc) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
      if (!m) throw new Error('Range not found');
      const c1 = colNum(m[1]), r1 = +m[2], c2 = m[3] ? colNum(m[3]) : c1, r2 = m[4] ? +m[4] : r1;
      return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    return new Range(this, a, b, nr == null ? 1 : nr, nc == null ? 1 : nc);
  }
  // As Google Sheets does it by hand: rows from r down move, and so do named ranges below (or around) them.
  insertRowsBefore(r, n) {
    const next = new Map(); for (const [k, v] of this.rows) next.set(k >= r ? k + n : k, v); this.rows = next;
    for (const x of this.ss.named.values()) if (x.sheet === this) { if (r <= x.r1) { x.r1 += n; x.r2 += n; } else if (r <= x.r2) x.r2 += n; }
  }
  deleteRows(r, n) {
    const next = new Map(); for (const [k, v] of this.rows) { if (k < r) next.set(k, v); else if (k >= r + n) next.set(k - n, v); } this.rows = next;
    for (const [name, x] of [...this.ss.named]) if (x.sheet === this) {
      const above = Math.max(0, Math.min(r + n - 1, x.r1 - 1) - r + 1), upTo = Math.max(0, Math.min(r + n - 1, x.r2) - r + 1);
      x.r1 -= above; x.r2 -= upTo;
      if (x.r2 < x.r1) this.ss.named.delete(name);
    }
  }
  getName() { return this.name; }
  getParent() { return this.ss; }
  getMaxRows() { return 20000; }
  // Test helpers
  row(r) { return [1, 2, 3, 4, 5, 6, 7, 8].map(c => this.disp(r, c)); }
  findRows(pred) { return [...this.rows.keys()].sort((a, b) => a - b).filter(r => pred(this.row(r), r)); }
}
class Spreadsheet {
  constructor(tab) { this.named = new Map(); this.sheets = new Map([[tab, new Sheet(tab, this)]]); }
  getSheetByName(n) { return this.sheets.get(n) || null; }
  addSheet(n) { const s = new Sheet(n, this); this.sheets.set(n, s); return s; }
  getRangeByName(n) { const x = this.named.get(n); return x ? new Range(x.sheet, x.r1, x.c, x.r2 - x.r1 + 1, x.nc) : null; }
  setNamedRange(n, range) { this.named.set(n, { sheet: range.sh, r1: range.r, r2: range.r + range.nr - 1, c: range.c, nc: range.nc }); }
  getName() { return 'fake intake sheet'; }
}
function makeCache() {
  const m = new Map(), c = { store: m, fail: false, skew: 0 };
  const now = () => Date.now() + c.skew;
  const live = k => { const e = m.get(k); if (!e) return null; if (e.exp <= now()) { m.delete(k); return null; } return e.v; };
  const check = () => { if (c.fail) throw new Error('Service invoked too many times: cache (test)'); };
  Object.assign(c, {
    get(k) { check(); return live(k); },
    put(k, v, ttl) { check(); m.set(k, { v: String(v), exp: now() + Math.min(ttl || 600, 21600) * 1000 }); },
    getAll(keys) { check(); const o = {}; keys.forEach(k => { const v = live(k); if (v != null) o[k] = v; }); return o; },
    putAll(o, ttl) { check(); for (const k of Object.keys(o)) c.put(k, o[k], ttl); },
    remove(k) { m.delete(k); },
    removeAll(keys) { keys.forEach(k => m.delete(k)); },
  });
  return c;
}
function makeDrive() {
  const files = new Map(); let n = 0;
  const handle = (id, f) => ({
    getId: () => id, getName: () => f.name, getUrl: () => `https://drive.google.com/file/d/${id}/view?usp=drivesdk`,
    getBlob: () => ({ getBytes: () => f.bytes }),
    getParents: () => { let done = false; return { hasNext: () => !done, next: () => { done = true; return { getId: () => f.folder }; } }; },
  });
  return {
    files,
    getFolderById: folder => ({
      getId: () => folder, getName: () => 'Intake photos',
      createFile: blob => { if (files.failAfter != null && files.size >= files.failAfter) throw new Error('Drive is busy (test).'); const id = 'GSF' + String(++n).padStart(6, '0') + 'drivefileidxxxxxxxx'; const f = { name: blob.name, bytes: blob.bytes, folder }; files.set(id, f); return handle(id, f); },
    }),
    getFileById: id => { const f = files.get(id); if (!f) throw new Error('No item with the given ID could be found.'); return handle(id, f); },
  };
}
// The backend: file (a Code.gs), props (script properties besides INTAKE_TOKEN 'tok'). → { call(body), ss, sh, props,
// cache, drive, version }. call() is doPost as the web app runs it: the reply object (or {error}).
function loadBackend({ file = path.join(process.env.REPO || require('path').resolve(__dirname, '..'), 'backend/Code.gs'), src, props = {}, tab = 'MAIN LOG (MBS)' } = {}) {
  const code = src || fs.readFileSync(file, 'utf8');
  const ss = new Spreadsheet(tab), sh = ss.getSheetByName(tab);
  const store = new Map(Object.entries(Object.assign({ INTAKE_TOKEN: 'tok', ANTHROPIC_API_KEY: 'test' }, props)));
  const cache = makeCache(), drive = makeDrive();
  const ctx = {
    console,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (store.has(k) ? store.get(k) : null), setProperty: (k, v) => { store.set(k, String(v)); },
      getProperties: () => Object.fromEntries(store), deleteProperty: k => { store.delete(k); } }) },
    SpreadsheetApp: { openById: () => ss, flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => cache },
    DriveApp: drive,
    Utilities: {
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
      base64Decode: s => signed(Buffer.from(String(s), 'base64')),
      base64Encode: bytes => Buffer.from(Array.from(bytes).map(b => (b + 256) % 256)).toString('base64'),
      computeDigest: (alg, s) => signed(crypto.createHash('sha256').update(String(s), 'utf8').digest()),
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      getUuid: () => crypto.randomUUID(), formatDate: d => String(d), sleep() {},
    },
    ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    Logger: { log() {} },
    UrlFetchApp: { fetch() { throw new Error('no Claude in these tests'); } },
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\n;this.__api = { doPost, doGet };', ctx, { filename: 'Code.gs' });
  const call = body => JSON.parse(ctx.__api.doPost({ postData: { contents: JSON.stringify(Object.assign({ token: 'tok' }, body)) } }).s);
  const version = JSON.parse(ctx.__api.doGet().s).v;
  return { call, ss, sh, props: store, cache, drive, version, ctx };
}
// The original v37 repo's Code.gs (backend v9, as deployed now).
const v9src = () => cp.execFileSync('git', ['-C', require('path').resolve(__dirname, '..'), 'show', '087d4d5:backend/Code.gs'], { encoding: 'utf8' });

// Sheet contents, as the backend writes them.
function sepRow(sh, row, day) { const d = dateOf(day); sh.set(row, 2, d); sh.set(row, 8, d); }
function boxRow(sh, row, day, cells, links) {
  const c = cells;
  [String(c[0]).toUpperCase(), String(c[1]), Number(c[2]) || 1, isNaN(Number(c[3])) || c[3] === '' ? c[3] : Number(c[3]), String(c[4]).toUpperCase(), c[5], c[6], dateOf(day)]
    .forEach((v, i) => sh.set(row, i + 1, v));
  (links || []).forEach((l, i) => sh.set(row, 48 + i, `=HYPERLINK("https://drive.google.com/file/d/${l.id}/view","${l.label}")`));
}
// A log: the days given (oldest first), each with its separator row and n rows, from row `from`. Returns the last row.
function fillLog(sh, from, days, n, mk) {
  let r = from;
  for (const day of days) {
    sepRow(sh, r++, day);
    for (let i = 0; i < n; i++, r++) boxRow(sh, r, day, mk ? mk(day, i, r) : [`CUSTOMER ${r}`, `1Z${String(r).padStart(16, '0')}`, '1', '3', 'UPS', 'NO INVOICE', `THING ${r} (1 TOTAL)`]);
  }
  return r - 1;
}

// For the Playwright harness: every request answered by Code.gs, Claude by lib_g1's fake. ctl.lose {op: n}: done,
// then the answer is lost on the way back; ctl.ops: every op that arrived.
function harnessBackend(be, ctl = {}) {
  const L = require('./lib_g1.js');
  const claude = L.makeBackend(ctl);
  ctl.ops = ctl.ops || []; ctl.lose = ctl.lose || {}; ctl.bodies = ctl.bodies || [];
  return async (op, body, calls) => {
    ctl.ops.push(op); ctl.bodies.push(body);
    if (ctl.hook) { const r = await ctl.hook(op, body); if (r === 'ABORT') return 'ABORT'; if (r !== undefined) return r; }
    if (op === 'claude' || op === 'warm') return claude(op, body, calls);
    await L.sleep(30);
    const out = be.call(body);
    if (ctl.lose[op] > 0 && !out.error) { ctl.lose[op]--; return 'ABORT'; }
    return out;
  };
}
function report(name, ok, why) { console.log(ok ? `PASS ${name}` : `FAIL ${name} ${why || ''}`); process.exit(ok ? 0 : 1); }
module.exports = { loadBackend, v9src, sepRow, boxRow, fillLog, harnessBackend, report, today, daysAgo, dateOf, shownDay, MONS };

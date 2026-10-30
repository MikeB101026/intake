/**
 * 700 Islands Intake — backend v7 (Google Apps Script web app).
 *
 * v7: dayRows — every device can list all of a day's rows from the sheet, whichever device logged them.
 *
 * v6: faster labels. The print helper holds one request open (printWait) that answers the moment a
 * label is waiting, instead of asking every 5 seconds and then fetching it in a second request.
 *
 * v5: label printing. "Print label" in the app queues a job (printAdd); the print helper on the laptop
 * asks for waiting jobs (printPeek, a count only, then printTake) and confirms each one (printDone).
 *
 * v4: link another device without typing the access code. The new device asks for a 6-digit number
 * (pairStart, no code needed), shows it and waits (pairPoll); an already-linked device types the number
 * (pairApprove). The new device then gets its OWN access code, stored here only as a hash under
 * DEV_<id>, so one device can be unlinked without changing INTAKE_TOKEN. Numbers are single-use, live
 * 5 minutes, at most 10 are handed out per 10 minutes, and 5 wrong numbers lock linking for 15 minutes.
 *
 * v3: the app trusts "append" with checkDupes only from v3 or later, because an earlier v2 build
 * ignored checkDupes. Fast mode switches itself off for an hour if the account can't use it.
 *
 * Speed:
 *  - Sorting (label vs inside) runs on Claude Haiku 5.5: about a second per photo instead of several.
 *  - The long rules prompt is sent as a cached system block, so every read after the first skips re-reading it.
 *  - "warm" pre-loads that cache when the camera opens.
 *  - "append" can check for repeats and write the rows in ONE round trip (checkDupes: true).
 *
 * Script properties (Project Settings → Script properties):
 *   ANTHROPIC_API_KEY  your key from console.anthropic.com      (required)
 *   INTAKE_TOKEN       the access code the phone app uses        (required)
 *   MODEL              optional, default claude-opus-5-5   (reads labels and contents)
 *   FAST_MODEL         optional, default claude-haiku-5-5  (sorts photos)
 *   SPEED              optional, default "fast" = Opus fast mode (up to 2.5x faster replies, 2x the price);
 *                      set it to "normal" to switch fast mode off
 *   DEV_…              one per linked device (written by the app; delete one to unlink that device)
 *
 * Update: paste this whole file over Code.gs → Save → Deploy → Manage deployments → ✏️ Edit
 *         → Version: New version → Deploy. The /exec address stays the same.
 */

const DEFAULTS = {
  SHEET_ID: '1PiWEM-XXEGY2cjo2YBsydi0q5wU20NsSPRMRActFpwQ',
  TAB: 'MAIN LOG (MBS)',
  WATCH_RANGE: 'B9070:B9110',
  WATCH_START: '9070',
  NEXT_ROW: '8480',
  PHOTO_FOLDER_ID: '1LVsQwAzpHMGiKzrJL0Cw1Q-l9LkalZ-w',
  PHOTO_COL: '48',                                     // AV
};
const PROPS = PropertiesService.getScriptProperties();
const prop = k => PROPS.getProperty(k) || DEFAULTS[k] || '';
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const VERSION = 7;

function doGet() { return out({ ok: true, app: '700 Islands Intake backend', v: VERSION }); }

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    // The label printer asks "anything waiting?" every few seconds; the answer is only a count.
    if (req.op === 'printPeek') return out(printPeek_());
    const token = PROPS.getProperty('INTAKE_TOKEN');
    if (!token) return out({ error: 'INTAKE_TOKEN is not set in the script’s Script properties.' });
    // Linking a new device needs no access code: it only gets one after a linked device types its number.
    if (req.op === 'pairStart') return out(pairStart_(req));
    if (req.op === 'pairPoll') return out(pairPoll_(req));
    const who = authed_(req.token, token);
    if (!who) return out({ error: 'Wrong access code.' });
    switch (req.op) {
      case 'pairApprove': return out(pairApprove_(req, who));
      case 'devices': return out({ devices: devices_(), self: who.id });
      case 'unlink': return out(unlink_(req));
      case 'ping': return out({ ok: true, v: VERSION, model: model_(), fastModel: fastModel_(), tab: prop('TAB'), nextRow: +prop('NEXT_ROW'), hasKey: !!PROPS.getProperty('ANTHROPIC_API_KEY') });
      case 'claude': return out(callClaude_(req));
      case 'warm': return out(warm_(req));
      case 'watch': return out({ names: watchList_() });
      case 'dupes': return out({ hits: findDupes_(req.trackings || []) });
      case 'append': return out(appendRows_(req.rows || [], !!req.checkDupes));
      case 'update': return out(updateRow_(req));
      case 'photos': return out(savePhotos_(req));
      case 'dayRows': return out(dayRows_(req));
      case 'printAdd': return out(printAdd_(req));
      case 'printTake': return out(printTake_());
      case 'printWait': return out(printWait_(req));
      case 'printDone': return out(printDone_(req));
    }
    return out({ error: 'Unknown request.' });
  } catch (err) {
    return out({ error: String(err && err.message || err) });
  }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------------- Access codes and linked devices ---------------- */
const PAIR_TTL = 300;                 // a link number lives 5 minutes
const PAIR_STARTS = 10;               // link numbers handed out per 10 minutes
const PAIR_BAD = 5;                   // wrong numbers before linking locks for 15 minutes
const hex_ = bytes => bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
const sha_ = s => hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
const rand_ = () => Utilities.getUuid().replace(/-/g, '');            // 122 random bits (SecureRandom)
const cache_ = () => CacheService.getScriptCache();                    // shared by all three deployments
// A fixed zone: reading the script's own time zone setting needs a Google permission the web app doesn't have.
const nowText_ = () => Utilities.formatDate(new Date(), 'America/New_York', 'd MMM yyyy HH:mm').toUpperCase();

/** The main access code → {id: ''}; a linked device's own code (dev_<id>_<secret>) → {id}; anything else → null. */
function authed_(given, token) {
  if (typeof given !== 'string' || !given) return null;
  if (given === token) return { id: '' };
  const m = given.match(/^dev_([0-9a-f]{12})_([0-9a-f]{64})$/);
  if (!m) return null;
  const rec = PROPS.getProperty('DEV_' + m[1]);
  if (!rec) return null;
  return JSON.parse(rec).h === sha_(m[2]) ? { id: m[1] } : null;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('The backend is busy. Try again in a moment.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/** New device: get a 6-digit number for its screen, plus a private pair id only this device knows (used to poll).
 *  (Don't use the word s-h-o-w in comments here: Apps Script then asks for an extra UI permission and the web app stops.) */
function pairStart_(req) {
  return withLock_(() => {
    const c = cache_(), bucket = 'pairStarts:' + Math.floor(Date.now() / 600000);
    const n = +(c.get(bucket) || 0);
    if (n >= PAIR_STARTS) throw new Error('Too many link requests. Wait 10 minutes and try again.');
    c.put(bucket, String(n + 1), 600);
    let code = '';
    for (let i = 0; i < 20 && !code; i++) {
      const k = String(parseInt(rand_().slice(0, 12), 16) % 1000000).padStart(6, '0');
      if (!c.get('pair:' + k)) code = k;
    }
    if (!code) throw new Error('Couldn’t make a link number. Try again.');
    const id = rand_() + rand_();
    const name = String(req.name || '').replace(/[^\w .,()+\/-]/g, '').trim().slice(0, 40) || 'Unnamed device';
    c.put('pair:' + code, JSON.stringify({ id, name, state: 'wait', exp: Date.now() + PAIR_TTL * 1000 }), PAIR_TTL);
    c.put('pairId:' + id, code, PAIR_TTL);
    return { code, pairId: id, ttl: PAIR_TTL };
  });
}

/** New device, every few seconds: {state: 'wait' | 'gone'}, or once approved {state: 'ok', token} — given out once. */
function pairPoll_(req) {
  const id = String(req.pairId || '');
  if (!/^[0-9a-f]{64}$/.test(id)) return { state: 'gone' };
  const c = cache_(), code = c.get('pairId:' + id);
  if (!code) return { state: 'gone' };
  const p0 = JSON.parse(c.get('pair:' + code) || 'null');
  if (!p0 || p0.id !== id) return { state: 'gone' };
  if (p0.state !== 'ok') return { state: 'wait' };
  return withLock_(() => {
    const p = JSON.parse(c.get('pair:' + code) || 'null');
    if (!p || p.id !== id || p.state !== 'ok') return { state: 'gone' };
    c.removeAll(['pair:' + code, 'pairId:' + id]);                       // single use
    const devId = rand_().slice(0, 12), secret = rand_() + rand_();
    PROPS.setProperty('DEV_' + devId, JSON.stringify({ h: sha_(secret), name: p.name, at: nowText_(), by: p.by }));
    return { state: 'ok', token: 'dev_' + devId + '_' + secret, name: p.name };
  });
}

/** Linked device: approve the number shown on the new device. */
function pairApprove_(req, who) {
  return withLock_(() => {
    const c = cache_(), bad = +(c.get('pairBad') || 0);
    if (bad >= PAIR_BAD) throw new Error('Too many wrong numbers. Linking is locked for 15 minutes.');
    const code = String(req.code || '').replace(/\D/g, '');
    const p = code.length === 6 ? JSON.parse(c.get('pair:' + code) || 'null') : null;
    if (!p || p.state !== 'wait' || p.exp < Date.now()) {
      c.put('pairBad', String(bad + 1), 900);
      throw new Error(bad + 1 >= PAIR_BAD ? 'Wrong number. Linking is now locked for 15 minutes.'
        : 'That number isn’t waiting to be linked (wrong, already used or expired). ' + (PAIR_BAD - bad - 1) + ' tries left.');
    }
    p.state = 'ok'; p.by = who.id || 'main';
    const left = Math.max(120, Math.round((p.exp - Date.now()) / 1000));   // time for the new device to pick it up
    c.put('pair:' + code, JSON.stringify(p), left);
    c.put('pairId:' + p.id, code, left);
    return { ok: true, name: p.name };
  });
}

/* ---------------- Label printing ----------------
   "Print label" in the app puts a job here; the print helper on the laptop (tools/print_agent.py) picks it
   up and prints the 700 Islands label on the D520. Jobs wait in the script cache for up to 6 hours. A job
   taken but not confirmed printed is handed out again after 2 minutes. */
const PRINT_TTL = 21600;
const printQ_ = c => JSON.parse(c.get('printQ') || '[]');
function printPeek_() {
  const c = cache_(), now = Date.now();
  c.put('printSeen', String(now), PRINT_TTL);
  return { n: printQ_(c).filter(j => !j.taken || now - j.taken > 120000).length };
}
function printAdd_(req) {
  const name = String(req.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!name) throw new Error('No customer name to print.');
  const piece = String(req.piece || '').replace(/[^0-9 \/]/g, '').trim().slice(0, 12) || '1 / 1';
  const copies = Math.min(5, Math.max(1, parseInt(req.copies, 10) || 1));
  return withLock_(() => {
    const c = cache_(), q = printQ_(c);
    const job = { id: rand_().slice(0, 16), name, piece, copies, at: Date.now() };
    q.push(job);
    c.put('printQ', JSON.stringify(q.slice(-100)), PRINT_TTL);
    const seen = +(c.get('printSeen') || 0);
    return { ok: true, id: job.id, waiting: q.length, printerOnline: Date.now() - seen < 60000 };
  });
}
function printTake_() {
  return withLock_(() => {
    const c = cache_(), q = printQ_(c), now = Date.now();
    const jobs = q.filter(j => !j.taken || now - j.taken > 120000);
    jobs.forEach(j => { j.taken = now; });
    c.put('printQ', JSON.stringify(q), PRINT_TTL);
    c.put('printSeen', String(now), PRINT_TTL);
    return { jobs: jobs.map(j => ({ id: j.id, name: j.name, piece: j.piece, copies: j.copies, at: j.at })) };
  });
}
/** Label printer, v6: one request that waits up to ~20 s and answers the moment a label is waiting
 *  (instead of asking every few seconds), so a label starts printing right after "Print" is tapped. */
function printWait_(req) {
  const c = cache_(), until = Date.now() + Math.min(25, Math.max(1, +req.wait || 20)) * 1000;
  c.put('printSeen', String(Date.now()), PRINT_TTL);
  while (Date.now() < until) {
    const now = Date.now();
    if (printQ_(c).some(j => !j.taken || now - j.taken > 120000)) return printTake_();
    Utilities.sleep(400);
  }
  return { jobs: [] };
}
function printDone_(req) {
  const ids = (Array.isArray(req.ids) ? req.ids : []).map(String);
  return withLock_(() => {
    const c = cache_();
    c.put('printQ', JSON.stringify(printQ_(c).filter(j => ids.indexOf(j.id) < 0)), PRINT_TTL);
    return { ok: true };
  });
}

function devices_() {
  const all = PROPS.getProperties();
  return Object.keys(all).filter(k => /^DEV_[0-9a-f]{12}$/.test(k)).map(k => {
    const r = JSON.parse(all[k]);
    return { id: k.slice(4), name: r.name, at: r.at };
  });
}
function unlink_(req) {
  const id = String(req.id || '');
  if (!/^[0-9a-f]{12}$/.test(id)) throw new Error('Unknown device.');
  PROPS.deleteProperty('DEV_' + id);
  return { ok: true };
}

/* ---------------- Claude ---------------- */
function model_() { return PROPS.getProperty('MODEL') || 'claude-opus-5-5'; }
function fastModel_() { return PROPS.getProperty('FAST_MODEL') || 'claude-haiku-5-5'; }

function post_(body) {
  const key = PROPS.getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set in the script’s Script properties.');
  const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  const betas = [];
  if (/opus|fable|sonnet-5-5/.test(body.model)) { body.fallbacks = 'default'; betas.push('server-side-fallback-2026-07-01'); }
  if (body.speed === 'fast') betas.push('fast-mode-2026-02-01');
  if (betas.length) headers['anthropic-beta'] = betas.join(',');
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', headers, payload: JSON.stringify(body), muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  let j = {};
  try { j = JSON.parse(res.getContentText()); } catch (e) {}
  if (code !== 200 && body.speed === 'fast') {            // fast mode is a research preview: never let it break a read
    if (code !== 429) CacheService.getScriptCache().put('fastOff', '1', 3600);   // not available to this account: off for an hour
    delete body.speed; return post_(body);
  }
  if (code === 429) throw new Error('Claude is busy (rate limit). Try again in a minute.');
  if (code === 401) throw new Error('The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.');
  if (code === 400 && /credit|billing|balance/i.test(JSON.stringify(j))) throw new Error('Your Anthropic account is out of credit. Add credit at console.anthropic.com.');
  if (code !== 200) throw new Error('Claude API error ' + code + (j.error && j.error.message ? ': ' + j.error.message : ''));
  return j;
}

/** req: {prompt, images:[b64 jpeg], system?, effort?, fast?, careful?} */
function callClaude_(req) {
  const fast = !!req.fast;
  const model = fast ? fastModel_() : model_();
  const content = (req.images || []).map(b64 => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }));
  content.push({ type: 'text', text: String(req.prompt || '') });
  const body = {
    model,
    max_tokens: fast ? 2000 : 16000,
    output_config: { effort: fast ? 'low' : (req.effort || 'medium') },
    messages: [{ role: 'user', content }],
  };
  // The rules never change, so they sit in a cached system block: after the first box they cost a fraction and read faster.
  if (req.system) body.system = [{ type: 'text', text: String(req.system), cache_control: { type: 'ephemeral' } }];
  if (!fast && (PROPS.getProperty('SPEED') || 'fast') === 'fast' && /opus/.test(model) && !CacheService.getScriptCache().get('fastOff')) body.speed = 'fast';
  const j = post_(body);
  if (j.stop_reason === 'refusal') throw new Error('Claude declined to read these photos.');
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  if (!text.trim()) throw new Error('Claude returned an empty answer. Try again.');
  return { text, model: j.model, usage: j.usage || null, truncated: j.stop_reason === 'max_tokens' };
}

/** Load the rules into the prompt cache before the first box is read (max_tokens 0 = nothing generated). */
function warm_(req) {
  if (!req.system) return { ok: true };
  const body = {
    model: model_(), max_tokens: 0,
    system: [{ type: 'text', text: String(req.system), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: 'ok' }],
  };
  try { const j = post_(body); return { ok: true, usage: j.usage || null }; } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

/* ---------------- Sheet ---------------- */
function sheet_() {
  const sh = SpreadsheetApp.openById(prop('SHEET_ID')).getSheetByName(prop('TAB'));
  if (!sh) throw new Error('Tab "' + prop('TAB') + '" not found in the sheet.');
  return sh;
}
const alnum_ = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const caps_ = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toUpperCase();
function dayOf_(s) {
  const m = String(s || '').trim().match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
  if (!m) return null;
  const i = MON.indexOf(m[2].toUpperCase());
  return i < 0 ? null : m[3] + '-' + ('0' + (i + 1)).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}
function dateOf_(day) { const p = day.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12); }
function watchStop_() { return (+prop('WATCH_START') || 999999) - 1; }

/** Last row with something in column B (above the watch-list block), plus the column values read on the way. */
function findEnd_(sh) {
  const stop = watchStop_();
  let from = Math.max(2, (+prop('NEXT_ROW') || 3) - 1);
  for (let hop = 0; hop < 60; hop++) {
    const to = Math.min(from + 300, stop);
    if (to < from) break;
    const vals = sh.getRange('B' + from + ':B' + to).getDisplayValues();
    let last = -1;
    vals.forEach((r, i) => { if (String(r[0]).trim() !== '') last = i; });
    if (last < 0) break;
    if (last === vals.length - 1 && to < stop) { from = to + 1; continue; }
    return { L: from + last, vals: vals.slice(0, last + 1), from };
  }
  let hi = Math.max(2, (+prop('NEXT_ROW') || 3) - 2);
  for (let i = 0; i < 100 && hi >= 2; i++) {
    const lo = Math.max(2, hi - 59);
    const vals = sh.getRange('B' + lo + ':B' + hi).getDisplayValues();
    let last = -1;
    vals.forEach((r, k) => { if (String(r[0]).trim() !== '') last = k; });
    if (last >= 0) return { L: lo + last, vals: vals.slice(0, last + 1), from: lo };
    hi = lo - 1;
  }
  throw new Error('Couldn’t find the end of the log.');
}
function lastSep_(vals, from) {
  for (let i = vals.length - 1; i >= 0; i--) { const d = dayOf_(vals[i][0]); if (d) return { row: from + i, day: d }; }
  return null;
}
/** Columns A–G must be empty (H often holds a pre-filled date, which is fine to overwrite). */
function guardEmpty_(sh, row, n) {
  const v = sh.getRange(row, 1, n, 7).getDisplayValues();
  v.forEach((r, i) => { if (r.some(c => String(c).trim() !== '')) throw new Error('Sheet row ' + (row + i) + ' isn’t empty — stopped so nothing gets overwritten.'); });
}

/** Every row logged on one day, from any device or typed by hand (read-only; looks back 500 rows). */
function dayRows_(req) {
  const day = String(req.day || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Bad day.');
  const sh = sheet_(), end = findEnd_(sh), from = Math.max(2, end.L - 500);
  const rows = [];
  sh.getRange(from, 1, end.L - from + 1, 8).getDisplayValues().forEach((r, i) => {
    if (dayOf_(r[7]) !== day) return;
    if (!String(r[0]).trim() && dayOf_(r[1])) return;                    // the day's separator row
    if (r.slice(0, 7).some(c => String(c).trim() !== '')) rows.push({ row: from + i, cells: r.slice(0, 8) });
  });
  return { rows };
}

function watchList_() {
  return sheet_().getRange(prop('WATCH_RANGE')).getDisplayValues().map(r => String(r[0]).trim()).filter(Boolean);
}

function dupesIn_(sh, L, trackings) {
  const lo = Math.max(2, L - 3000);
  const col = sh.getRange('B' + lo + ':B' + L).getDisplayValues();
  const seen = {};
  col.forEach((r, i) => { const t = alnum_(r[0]); if (t.length >= 8) seen[t] = lo + i; });
  const hits = {};
  trackings.forEach(t => { const k = alnum_(t); if (seen[k]) hits[t] = seen[k]; });
  return hits;
}
function findDupes_(trackings) {
  const sh = sheet_();
  return dupesIn_(sh, findEnd_(sh).L, trackings);
}

/** rows: [{id, day:'YYYY-MM-DD', cells:[customer, tracking, pieces, weight, shipper, invoice, contents]}]
 *  checkDupes: if any tracking is already in the log, write nothing and return {dupes}. */
function appendRows_(rows, checkDupes) {
  if (!rows.length) return { placed: [] };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheet_(), stop = watchStop_();
    const end = findEnd_(sh);
    if (checkDupes) {
      const hits = dupesIn_(sh, end.L, rows.map(r => String(r.cells[1] || '')));
      if (Object.keys(hits).length) return { dupes: hits, placed: [] };
    }
    let L = end.L;
    let sep = lastSep_(end.vals, end.from) || JSON.parse(prop('LAST_SEP') || 'null');
    const days = Array.from(new Set(rows.map(r => r.day))).sort();
    const placed = [];
    for (const day of days) {
      const group = rows.filter(r => r.day === day);
      if (!sep || day > sep.day) {
        if (L + 1 > stop) throw new Error('The log has reached the watch list block at row ' + (stop + 1) + '. Insert rows in the sheet first.');
        guardEmpty_(sh, L + 1, 1);
        const d = dateOf_(day);
        sh.getRange(L + 1, 1, 1, 8).setValues([['', d, '', '', '', '', '', d]]);
        sh.getRange(L + 1, 2).setNumberFormat('d mmm yyyy');
        sh.getRange(L + 1, 8).setNumberFormat('d mmm yyyy');
        L += 1; sep = { row: L, day };
      }
      const k = group.length;
      if (L + k > stop) throw new Error('Not enough empty rows above the watch list block (row ' + (stop + 1) + '). Insert rows in the sheet first.');
      guardEmpty_(sh, L + 1, k);
      sh.getRange(L + 1, 2, k, 1).setNumberFormat('@');
      sh.getRange(L + 1, 1, k, 8).setValues(group.map(g => {
        const c = g.cells;
        const pcs = Number(c[2]) || 1, wt = c[3] === '' || c[3] == null || isNaN(Number(c[3])) ? (c[3] || '') : Number(c[3]);
        return [caps_(c[0]), String(c[1] || ''), pcs, wt, caps_(c[4]), c[5], String(c[6] || ''), dateOf_(day)];
      }));
      sh.getRange(L + 1, 8, k, 1).setNumberFormat('d mmm yyyy');
      SpreadsheetApp.flush();
      const back = sh.getRange(L + 1, 1, k, 2).getDisplayValues();
      group.forEach((g, i) => {
        if (caps_(back[i][0]) !== caps_(g.cells[0]) || alnum_(back[i][1]) !== alnum_(g.cells[1]))
          throw new Error('Sheet row ' + (L + 1 + i) + ' didn’t read back as written. Check the sheet.');
        placed.push({ id: g.id, row: L + 1 + i });
      });
      L += k;
    }
    PROPS.setProperty('NEXT_ROW', String(L + 1));
    PROPS.setProperty('LAST_SEP', JSON.stringify(sep));
    return { placed, nextRow: L + 1 };
  } finally {
    lock.releaseLock();
  }
}

function updateRow_(req) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheet_(), row = Number(req.row);
    if (!(row >= 2)) throw new Error('Bad row number.');
    if (alnum_(sh.getRange(row, 2).getDisplayValue()) !== alnum_(req.expectTracking)) throw new Error('Sheet row ' + row + ' no longer holds this box. Fix it by hand.');
    const c = req.cells;
    sh.getRange(row, 2).setNumberFormat('@');
    const wt = c[3] === '' || c[3] == null || isNaN(Number(c[3])) ? (c[3] || '') : Number(c[3]);
    sh.getRange(row, 1, 1, 7).setValues([[caps_(c[0]), String(c[1] || ''), Number(c[2]) || 1, wt, caps_(c[4]), c[5], String(c[6] || '')]]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** photos: [{label, name, b64}] → files in the photo folder, links in AV… of the box's row. */
function savePhotos_(req) {
  const row = Number(req.row), photos = (req.photos || []).slice(0, 15);
  if (!(row >= 2) || !photos.length) return { links: [] };
  const sh = sheet_();
  if (alnum_(sh.getRange(row, 2).getDisplayValue()) !== alnum_(req.expectTracking)) throw new Error('Sheet row ' + row + ' no longer holds this box.');
  const folder = DriveApp.getFolderById(prop('PHOTO_FOLDER_ID'));
  const links = photos.map(p => {
    const blob = Utilities.newBlob(Utilities.base64Decode(p.b64), 'image/jpeg', String(p.name || 'photo.jpg'));
    return { label: p.label, url: folder.createFile(blob).getUrl() };
  });
  const cells = links.map(l => '=HYPERLINK("' + l.url + '","' + l.label + '")');
  while (cells.length < 15) cells.push('');
  sh.getRange(row, +prop('PHOTO_COL'), 1, 15).setValues([cells]);
  return { links };
}

/** Run once from the editor (select setup → Run) to approve access and check the key and the sheet. */
function setup() {
  const sh = sheet_();
  Logger.log('Sheet OK: ' + sh.getParent().getName() + ' → ' + sh.getName());
  Logger.log('API key set: ' + !!PROPS.getProperty('ANTHROPIC_API_KEY'));
  Logger.log('Access code set: ' + !!PROPS.getProperty('INTAKE_TOKEN'));
  Logger.log('Linked devices: ' + devices_().length);
  Logger.log('Models: ' + model_() + ' (reading), ' + fastModel_() + ' (sorting)');
  Logger.log('Photo folder: ' + DriveApp.getFolderById(prop('PHOTO_FOLDER_ID')).getName());
}

// Helpers for the G1 tests (not a test itself): a fake Apps Script backend with a tiny sheet, a fake Claude that
// answers from the photos it is sent (each test photo has its own aspect ratio), and page helpers.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const alnum = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
// Photo identity = height / width. Labels 0.30-0.36, items 0.40-0.58 (camera frames are 0.75 / 0.5625: never these).
const SHAPES = { L1: 0.30, L2: 0.32, L3: 0.34, L4: 0.36, A: 0.40, B: 0.42, C: 0.44, D: 0.46, E: 0.48, F: 0.50, G: 0.52, H: 0.54, I: 0.58 };
const ITEMS = { A: 'ALPHA SHOE', B: 'BRAVO SOCK', C: 'CHARLIE LAMP', D: 'DELTA MUG', E: 'ECHO FAN', F: 'FOXTROT HAT', G: 'GOLF TOWEL', H: 'HOTEL CUP', I: 'INDIA BAG', '?': 'CAMERA ITEM' };
const LABELS = {
  L1: { customer: 'JOHN SMITH', tracking: 'TBA111111111111', weight: '4' },
  L2: { customer: 'MARY JONES', tracking: 'TBA222222222222', weight: '7' },
  L3: { customer: 'PETER PAN', tracking: 'TBA333333333333', weight: '9' },
  L4: { customer: 'ANNA LEE', tracking: 'TBA444444444444', weight: '2' },
};
const isLabel = id => /^L\d$/.test(id);
function jpegDims(b64) {
  const b = Buffer.from(b64, 'base64'); let o = 2;
  while (o + 8 < b.length) {
    if (b[o] !== 0xFF) { o++; continue; }
    const m = b[o + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: b.readUInt16BE(o + 5), w: b.readUInt16BE(o + 7) };
    o += 2 + b.readUInt16BE(o + 2);
  }
  return null;
}
function idOf(b64) {
  const d = jpegDims(b64); if (!d) return '?';
  const r = d.h / d.w; let best = '?', bd = 0.008;
  for (const [k, v] of Object.entries(SHAPES)) { const dd = Math.abs(v - r); if (dd < bd) { bd = dd; best = k; } }
  return best;
}
const dispDay = day => { const [y, m, d] = day.split('-'); return `${d} ${MON[+m - 1]} ${y}`; };

// ctl: { lat: {kind: ms}, classifyAs: {id: 'label'|'inside'}, sortFail: bool, dayRows(day) -> extra rows, photoGet(id) -> b64|null|'ABORT', hook(kind, ids, body) }
function makeBackend(ctl = {}) {
  ctl.log = ctl.log || []; ctl.sheet = ctl.sheet || { rows: [], next: 100 }; ctl.uploads = ctl.uploads || [];
  const lat = Object.assign({ sortOne: 120, classify: 150, label: 250, verify: 200, item: 150, merge: 150, main: 300, more: 200 }, ctl.lat || {});
  const answer = body => {
    const p = String(body.prompt || ''), ids = (body.images || []).map(idOf);
    if (p.startsWith('This photo was taken while logging ONE package')) return ['sortOne', ids, { kind: isLabel(ids[0]) ? 'label' : 'inside', trk4: '', box: null }];
    if (/^These \d+ photos are all of ONE package/.test(p)) return ['classify', ids, ids.map((id, i) => ({ n: i + 1, kind: (ctl.classifyAs || {})[id] || (isLabel(id) ? 'label' : 'inside'), trk4: '', box: null }))];
    if (/^Read (this photo|these \d+ photos) of the OUTSIDE/.test(p)) { const L = LABELS[ids.find(isLabel)] || {}; return ['label', ids, { customer: L.customer || '', tracking: L.tracking || '', weight_printed: L.weight || '', weight_unit: 'lb', shipper: 'AMAZON', invoice: false, label_photo: 1, label_box: null, paperwork_items: [], carton_items: [], note_items: [], flags: [], badges: [] }]; }
    if (p.startsWith('This is a shipping label or a bill of lading')) { const L = LABELS[ids[0]] || {}; return ['verify', ids, { tracking: L.tracking || '', weight_printed: L.weight || '', weight_unit: 'lb', sure: true }]; }
    if (p.startsWith('This ONE photo shows something that was INSIDE')) return ['item', ids, { items: [{ item: ITEMS[ids[0]] || 'CAMERA ITEM', qty: 1 }], slip: false, invoice: false, flags: [] }];
    if (p.startsWith('The images are the INSIDE photos of ONE package')) {
      let arr = []; try { arr = JSON.parse(p.split('\n')[1]); } catch (e) {}
      const c = []; for (const e of arr) for (const it of e.items) { const h = c.find(o => o.item === it.item); if (h) h.photos.push(e.n); else c.push({ item: it.item, qty: 1, photos: [e.n] }); }
      return ['merge', ids, { contents: c, flags: [] }];
    }
    if (/^Read these \d+ photos of ONE package/.test(p)) {
      const lid = ids.find(isLabel), L = (lid && LABELS[lid]) || {}, c = [];
      ids.forEach((id, i) => { if (isLabel(id)) return; const name = ITEMS[id] || 'CAMERA ITEM'; const h = c.find(o => o.item === name); if (h) h.photos.push(i + 1); else c.push({ item: name, qty: 1, photos: [i + 1] }); });
      return ['main', ids, { customer: L.customer || '', tracking: L.tracking || '', weight_printed: L.weight || '', weight_unit: 'lb', shipper: 'AMAZON', invoice: false, label_photo: 1, label_box: null, contents: c, flags: [], badges: [] }];
    }
    if (/^These \d+ photos show more of what was INSIDE/.test(p)) return ['more', ids, { contents: ids.map((id, i) => ({ item: ITEMS[id] || 'CAMERA ITEM', qty: 1, photos: [i + 1] })), flags: [] }];
    return ['?', ids, {}];
  };
  return async (op, body) => {
    const sh = ctl.sheet;
    switch (op) {
      case 'ping': return { ok: true, v: 9, nextRow: sh.next, model: 'm', fastModel: 'f', tab: 'T', hasKey: true };
      case 'warm': return { ok: true };
      case 'watch': return { names: [] };
      case 'claude': {
        const [kind, ids, out] = answer(body);
        ctl.log.push({ kind, ids, t: Date.now() });
        if (ctl.hook) { const r = await ctl.hook(kind, ids, body); if (r !== undefined) return r; }
        if (kind === 'sortOne' && ctl.sortFail) { await sleep(50); return { error: 'Claude is busy (test).' }; }
        await sleep(lat[kind] != null ? lat[kind] : 100);
        return { text: JSON.stringify(out) };
      }
      case 'append': {
        await sleep(ctl.appendMs || 150);
        const rows = body.rows || [];
        if (body.checkDupes) {
          const hits = {};
          for (const r of rows) { const k = alnum(r.cells[1]); const f = sh.rows.find(x => k.length >= 8 && alnum(x.cells[1]) === k); if (f) hits[r.cells[1]] = f.row; }
          if (Object.keys(hits).length) return { dupes: hits, placed: [] };
        }
        const placed = rows.map(r => { const row = sh.next++; sh.rows.push({ row, day: r.day, cells: r.cells.slice(0, 7), pics: [] }); return { id: r.id, row }; });
        return { placed, nextRow: sh.next };
      }
      case 'update': { const r = sh.rows.find(x => x.row === +body.row); if (r) r.cells = body.cells.slice(0, 7); return { ok: true }; }
      case 'dayRows': {
        const day = String(body.day || '');
        const own = sh.rows.filter(r => r.day === day).map(r => ({ row: r.row, cells: [...r.cells, dispDay(day)], pics: r.pics || [] }));
        return { rows: own.concat(ctl.dayRows ? ctl.dayRows(day) : []), nextRow: sh.next };
      }
      case 'photos': { await sleep(ctl.photosMs || 150); ctl.uploads.push({ row: body.row, who: (body.photos || []).map(p => idOf(p.b64)) }); return { links: [] }; }
      case 'photoGet': { const r = ctl.photoGet ? await ctl.photoGet(body.id) : null; if (r === 'ABORT') return 'ABORT'; return r ? { b64: r } : { error: 'Not found (test).' }; }
      case 'printAdd': return { ok: true, printerOnline: true };
    }
    return { error: 'Unknown request.' };
  };
}

// A JPEG of the given shape, made in the page (so it is a real, decodable photo).
const jcache = {};
async function jpeg(page, shape, w = 1000) {
  const key = shape + ':' + w; if (jcache[key]) return jcache[key];
  const h = Math.round(w * SHAPES[shape]);
  const b64 = await page.evaluate(async ([w, h, txt]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#c9a36b'; g.fillRect(0, 0, w, h); g.fillStyle = '#000'; g.font = Math.round(h / 3) + 'px sans-serif'; g.fillText(txt, 20, h / 2);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }, [w, h, shape]);
  return (jcache[key] = Buffer.from(b64, 'base64'));
}
// Every save of a photo (scaled to 2400) waits window.__slowSave ms first: a phone that is slow to save.
const slowSaves = t => t.ev(`(() => { const o = scaleTo; scaleTo = async (b, m, q) => { if (m === 2400 && window.__slowSave) await new Promise(r => setTimeout(r, window.__slowSave)); return o(b, m, q); }; return 1; })()`);
const setSlow = (t, ms) => t.page.evaluate(ms => { window.__slowSave = ms; }, ms);
const photoCount = t => t.ev('S.photos.size');
// PHONE CAMERA / + NEXT PHOTO: one photo back from the phone's camera app. wait: until it is stored.
async function phonePhoto(t, shape, wait = true) {
  const buf = await jpeg(t.page, shape), n = await photoCount(t);
  await t.page.setInputFiles('#nativeCam', { name: shape + '.jpg', mimeType: 'image/jpeg', buffer: buf });
  if (wait) await t.page.waitForFunction(n => window.__ev('S.photos.size') > n, n, { timeout: 20000, polling: 50 });
}
async function galleryPhotos(t, shapes) {
  const files = []; for (const s of shapes) files.push({ name: s + '.jpg', mimeType: 'image/jpeg', buffer: await jpeg(t.page, s) });
  await t.page.setInputFiles('#pickAll', files);
}
const waitFor = (t, expr, timeout = 30000) => t.page.waitForFunction(s => { try { return !!window.__ev(s); } catch (e) { return false; } }, expr, { timeout, polling: 50 });
// Nothing reading, sorting, sending, uploading or saving (works on v37 too, which has no S.saving / S.ending).
const IDLE = '!S.active.size && !S.readQ.length && !S.busy && !LINK.running && !S.sortP.size && !(S.saving > 0) && !(S.ending > 0) && !sorting';
async function waitIdle(t, timeout = 30000) { await waitFor(t, IDLE, timeout); await t.page.waitForTimeout(300); await waitFor(t, IDLE, timeout); }
const boxes = t => t.ev(`JSON.stringify(allBoxes().sort((a, b) => a.seq - b.seq).map(b => ({ id: b.id, seq: b.seq, n: b.photos.length, exist: b.photos.filter(id => S.photos.has(id)).length, status: b.status, view: viewStatus(b), sheetRow: b.sheetRow, contents: b.row.contents, customer: b.row.customer, note: b.note, readNote: b.read && b.read.note, reasons: reasons(b), lostShots: b.lostShots || 0, cur: b.id === S.current })))`).then(JSON.parse);
function report(name, ok, why) { console.log(ok ? `PASS ${name}` : `FAIL ${name} ${why || ''}`); process.exit(ok ? 0 : 1); }
module.exports = { sleep, SHAPES, ITEMS, LABELS, idOf, makeBackend, jpeg, slowSaves, setSlow, phonePhoto, galleryPhotos, waitFor, waitIdle, boxes, report, photoCount, IDLE };

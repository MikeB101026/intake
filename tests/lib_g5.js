// Helpers for the G5 tests (not a test itself): lib_g4's fake sheet backend, with a fake Claude that also reads the
// operator's note (a note naming PHONE CASE adds "PHONE CASE (2 TOTAL)" to the contents a read gives, one saying UNSURE
// adds a COUNT UNSURE flag) and a watch list the test steers (ctl.watchNames; ctl.watchDown: the request never
// arrives; ctl.watchHang: it is never answered; ctl.watchMs: its answer's delay).
const G = require('./lib_g4.js');
const G2 = require('./lib_g2.js');
const L = G.L;
const noteOf = body => { const m = String(body.prompt || '').match(/The operator's note[^"]*"([^"]*)"/); return m ? m[1] : ''; };
function makeBackend5(ctl = {}) {
  const base = G.makeBackend4(ctl);
  ctl.watchNames = ctl.watchNames || []; ctl.watchCalls = 0;
  return async (op, body, calls) => {
    if (op === 'watch') {
      ctl.watchCalls++;
      if (ctl.watchDown) return 'ABORT';
      if (ctl.watchHang) return new Promise(() => {});
      await L.sleep(ctl.watchMs || 60);
      return { names: ctl.watchNames.slice() };
    }
    const r = await base(op, body, calls);
    if (op !== 'claude' || !r || typeof r.text !== 'string') return r;
    const note = noteOf(body);
    if (!note) return r;
    let out; try { out = JSON.parse(r.text); } catch (e) { return r; }
    if (!Array.isArray(out.contents)) return r;                     // a label read: the note's lines come with the contents
    if (/PHONE CASE/i.test(note)) out.contents.push({ item: 'PHONE CASE', qty: 2, photos: [1] });
    if (/UNSURE/i.test(note)) out.flags = [...(out.flags || []), 'COUNT UNSURE — CHECK THE COUNT'];
    return { text: JSON.stringify(out) };
  };
}
async function begin5(ctl, opts = {}) {
  const t = await G.start(Object.assign({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: makeBackend5(ctl) }, opts));
  await L.waitFor(t, 'PACE.ready || PACE.off', 15000);
  await G.idle(t);
  return t;
}
// PHONE CAMERA: one photo into the box in progress, stored and sorted before it returns.
async function shot(t, shape) {
  await L.phonePhoto(t, shape);
  await L.waitFor(t, '!S.sortP.size && !(S.saving > 0)', 15000);
  await t.page.waitForTimeout(150);
}
// Types into a field of a box's card and leaves it (the field's change event), the way the operator does.
async function typeField(t, id, field, text) {
  await G2.expand(t, id);
  const sel = `[data-id="${id}"] [data-field="${field}"]`;
  await t.page.fill(sel, text);
  await t.page.press(sel, 'Tab');
}
const rowWith = (ctl, trk) => [...ctl.sheet.entries()].filter(([n, r]) => G.alnum(r.cells[1]) === G.alnum(trk)).map(([n, r]) => Object.assign({ row: n }, r));
const view = (t, id) => t.ev(`(b => b && { view: viewStatus(b), sheetRow: b.sheetRow, contents: b.row.contents, note: b.note, readNote: (b.read || {}).note || '', reasons: reasons(b), flags: b.flags })(S.boxes.get(${JSON.stringify(id)}))`);
module.exports = { G, G2, L, makeBackend5, begin5, shot, typeField, rowWith, view };

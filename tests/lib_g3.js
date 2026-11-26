// Helpers for the G3 tests (not a test itself): the app on a fake clock (Playwright's page.clock, installed and then the
// page reloaded, so the app boots on it), lib_g1's fake backend and fake Claude, plus sends that fail on the way.
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = n => String(n).padStart(2, '0');
const key = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const disp = k => { const [y, m, d] = k.split('-'); return `${d} ${MON[+m - 1]} ${y}`; };
// A local time (the page and node share the machine's time zone).
const at = (y, mo, d, h, mi, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();
// ctl (besides lib_g1's): appendFail: every row write is lost on the way (nothing written);
// loseReply: n writes go into the sheet but their answer is lost; appendGate: a promise every row write waits for.
// ctl.appends counts the write requests.
function makeBackend3(ctl = {}) {
  const base = L.makeBackend(ctl);
  ctl.appends = 0;
  return async (op, body, calls) => {
    if (op === 'append') {
      ctl.appends++;
      if (ctl.appendGate) await ctl.appendGate;
      if (ctl.appendFail) return 'ABORT';
      if (ctl.loseReply) { ctl.loseReply--; await base(op, body, calls); return 'ABORT'; }
    }
    return base(op, body, calls);
  };
}
async function booted(t) {
  await t.page.waitForFunction(() => typeof window.__ev === 'function');
  await L.waitFor(t, 'PACE.ready || PACE.off', 15000);     // the saved boxes are loaded
  await t.page.waitForTimeout(300);
}
// The app started on the fake clock at `time`.
async function startAt(time, ctl) {
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: makeBackend3(ctl) });
  await t.page.clock.install({ time });
  await t.page.reload({ waitUntil: 'load' });
  await booted(t);
  return t;
}
async function reload(t) { await t.page.reload({ waitUntil: 'load' }); await booted(t); }
// PHONE CAMERA: one photo, stored and sorted (label / inside) before it returns.
async function shot(t, shape) {
  await L.phonePhoto(t, shape);
  await L.waitFor(t, '!S.sortP.size && !(S.saving > 0)', 15000);
  await t.page.waitForTimeout(200);
}
// "Finish this box", then everything read and sent.
async function finish(t) {
  await t.page.click('#curFinish');
  await t.page.waitForTimeout(300);
  await L.waitIdle(t, 30000);
}
const rowsWith = (ctl, trk) => ctl.sheet.rows.filter(r => r.cells[1] === trk);
const boxes = t => t.ev(`JSON.stringify(allBoxes().sort((a, b) => a.day.localeCompare(b.day) || a.seq - b.seq).map(b => ({ id: b.id, day: b.day, seq: b.seq, n: b.photos.length, status: b.status, view: viewStatus(b), sheetRow: b.sheetRow, customer: b.row.customer, tracking: b.row.tracking, contents: b.row.contents, imported: !!b.imported, cur: b.id === S.current })))`).then(JSON.parse);
const noticeText = t => t.ev('document.querySelector("#notice").hidden ? "" : document.querySelector("#notice").textContent');
const pageErrors = t => t.errs.filter(e => !/Failed to load resource|net::ERR_FAILED/.test(e));
module.exports = { L, at, key, disp, makeBackend3, startAt, reload, shot, finish, rowsWith, boxes, noticeText, pageErrors };

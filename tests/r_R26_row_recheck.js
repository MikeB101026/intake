// R26 (backend): a box's photo save makes one Drive file per photo (about a second each in Apps Script) before it writes
// AV–BJ. A row deleted or inserted by hand above the box meanwhile puts another box (or a stray row) on that row number:
// the save must then write no links at all — never over the other box's links — and say "Sheet row N no longer holds
// this box." (the app moves the box to its row with the next sync and saves it there). Box X (row 101) saves 5, 15 or 20
// photos; the office deletes the stray row 100 above it, or inserts a row there, during each one of the file saves in
// turn. Box Z below keeps its own link every time, X's links land on X's row once it is saved there, and a save with no
// hand edit is unchanged. Runs REPO's backend/Code.gs in node. (Before: the row was checked only before the first file,
// and X's links went over Z's — or onto the stray row.)
const path = require('path');
const G6 = require('./lib_g6.js');
const NAME = 'r_R26_row_recheck';
let ok = true, why = '';
const fail = m => { ok = false; why += m + '; '; };
const day = G6.today();
const X = ['BOX X', '1Z999AA10123456784', '1', '3', 'UPS', 'NO INVOICE', 'X (1 TOTAL)'];
const Z = ['BOX Z', '1Z999AA10123456785', '1', '3', 'UPS', 'NO INVOICE', 'Z (1 TOTAL)'];
const ZLINK = 'ZZZZZZZZZZZZZZZZZZZZZZZZ';
function world() {
  const be = G6.loadBackend({ file: path.join(process.env.REPO || require('path').resolve(__dirname, '..'), 'backend/Code.gs'), props: { NEXT_ROW: '103' } });
  G6.sepRow(be.sh, 99, day);
  G6.boxRow(be.sh, 100, day, ['STRAY ROW', '', '1', '', '', '', '']);   // the row the office deletes (or a row inserted there)
  G6.boxRow(be.sh, 101, day, X);
  G6.boxRow(be.sh, 102, day, Z, [{ id: ZLINK, label: 'LABEL 1' }]);
  return be;
}
// The hand edit lands while the backend makes file number `at` (0: no edit during the save).
function save(be, n, edit, at, row = 101) {
  let made = 0;
  const getFolder = be.drive.getFolderById;
  be.ctx.DriveApp.getFolderById = id => {
    const f = getFolder(id), cf = f.createFile;
    f.createFile = b => { const h = cf(b); if (++made === at) { if (edit === 'delete') be.sh.deleteRows(100, 1); else be.sh.insertRowsBefore(100, 1); } return h; };
    return f;
  };
  const photos = Array.from({ length: n }, (_, i) => ({ label: i < 2 ? `LABEL ${i + 1}` : `INSIDE ${i - 1}`, name: `${day} box 1 BOX X ${i}.jpg`, b64: Buffer.from('x' + i).toString('base64') }));
  return be.call({ op: 'photos', row, expectTracking: X[1], photos });
}
const rowOf = (be, name) => be.sh.findRows(c => c[0] === name)[0];
const links = (be, r) => r ? be.sh.getRange(r, 48, 1, 15).getFormulas()[0].filter(Boolean) : [];
const xLinked = (be, r) => links(be, r).filter(f => /\/d\/GSF/.test(f)).length;   // links to files this save made
try {
  let runs = 0;
  for (const edit of ['delete', 'insert']) for (const n of [5, 15, 20]) for (let at = 1; at <= n; at++) {
    const be = world(), r = save(be, n, edit, at), tag = `${edit} during file ${at} of ${n}`;
    runs++;
    const x = rowOf(be, 'BOX X'), z = rowOf(be, 'BOX Z'), s = rowOf(be, 'STRAY ROW');
    const wrong = be.sh.findRows(() => true).filter(q => q !== x && xLinked(be, q));
    if (wrong.length) { fail(`${tag}: X's links written on row ${wrong} (${be.sh.row(wrong[0])[0] || 'a blank row'})`); continue; }
    if (!links(be, z).some(f => f.includes(ZLINK))) { fail(`${tag}: Z lost its own link`); continue; }
    if (!r.error) { if (x !== 101 || xLinked(be, x) !== Math.min(15, n)) fail(`${tag}: no error, but X (row ${x}) holds ${xLinked(be, x)} links`); continue; }
    if (!/^Sheet row 101 no longer holds this box\.$/.test(r.error)) fail(`${tag}: error "${r.error}"`);
    if (s && xLinked(be, s)) fail(`${tag}: the stray row got X's links`);
    // The app's next try, once its sync has moved the box to its row: saved there.
    if (at === n) {
      const r2 = save(be, n, edit, 0, x);
      if (r2.error || xLinked(be, x) !== Math.min(15, n) || !links(be, rowOf(be, 'BOX Z')).some(f => f.includes(ZLINK))) fail(`${tag}: the save at X's row ${x}: ${JSON.stringify(r2).slice(0, 120)}, X links ${xLinked(be, x)}`);
    }
  }
  // No hand edit: saved as before, links on X's row, every photo in Drive.
  for (const n of [5, 20]) {
    const be = world(), r = save(be, n, 'delete', 0);
    if (r.error || r.saved !== n || xLinked(be, 101) !== Math.min(15, n) || be.drive.files.size !== n) fail(`no edit, ${n} photos: ${JSON.stringify({ err: r.error, saved: r.saved, links: xLinked(be, 101), files: be.drive.files.size })}`);
  }
  if (runs !== 80) fail('setup: ' + runs + ' runs');
} catch (e) { fail('exception ' + (e.stack || e.message)); }
G6.report(NAME, ok, why.length > 1500 ? why.slice(0, 1500) + '…' : why);

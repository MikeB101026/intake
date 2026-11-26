// R13 (backend): append hands a box's earlier row back instead of writing it again only to an app that asks for it
// (rowsBack: true — the v38 app, which notes what that row holds). A request without the flag — a phone still on v37,
// which notes what it sent now and ignores the row's cells — is written exactly as backend v9 writes it: a retry after a
// lost answer goes in as a second row, so a fix typed on the card meanwhile (weight 4 → 9, tracking …784 → …785) is in
// the sheet, never quietly dropped. Every send is still remembered: once that phone runs v38, its retry gets the row
// back. Runs REPO's backend/Code.gs and backend v9 (commit 087d4d5) in node, side by side on the same sheet.
// (Before: v10 handed the row back to every request, and the v37 phone's fix was lost.)
const path = require('path');
const G6 = require('./lib_g6.js');
const NAME = 'r_R13_rows_back';
let ok = true, why = '';
const fail = m => { ok = false; why += m + '; '; };
try {
  const day = G6.today();
  const props = { NEXT_ROW: '101', LAST_SEP: JSON.stringify({ row: 100, day }) };
  const v10 = G6.loadBackend({ file: path.join(process.env.REPO || require('path').resolve(__dirname, '..'), 'backend/Code.gs'), props });
  const v9 = G6.loadBackend({ src: G6.v9src(), props });
  if (v10.version !== 10 || v9.version !== 9) throw new Error(`setup: versions ${v10.version} / ${v9.version}`);
  for (const be of [v10, v9]) G6.sepRow(be.sh, 100, day);
  const box = (id, tracking, weight) => ({ id, day, cells: ['John Smith', tracking, '1', weight, 'AMAZON', 'NO INVOICE', 'DOOR (1 TOTAL)'] });
  // Rows that differ between the two sheets (A–H as the sheet shows them).
  const diff = () => [...new Set([...v10.sh.findRows(() => true), ...v9.sh.findRows(() => true)])].sort((a, b) => a - b)
    .filter(r => v10.sh.row(r).join('|') !== v9.sh.row(r).join('|')).map(r => `row ${r}: v10 ${v10.sh.row(r).slice(0, 4).join('|')} / v9 ${v9.sh.row(r).slice(0, 4).join('|')}`);
  // The same request to both, as a v37 phone sends it (no rowsBack): the same reply and the same sheet, every time.
  // (Once they differ, everything after differs too: stop at the first difference.)
  const both = (label, body) => {
    const a = v10.call(Object.assign({ op: 'append' }, body)), b = v9.call(Object.assign({ op: 'append' }, body));
    const d = diff(), props = ['NEXT_ROW', 'LAST_SEP'].filter(k => v10.props.get(k) !== v9.props.get(k));
    if (JSON.stringify(a) !== JSON.stringify(b) || d.length || props.length)
      throw Object.assign(new Error(`${label}: not as v9 — v10 replied ${JSON.stringify(a)}, v9 ${JSON.stringify(b)}; ${d.join('; ') || 'same rows'}${props.length ? '; props differ: ' + props : ''}`), { mine: true });
    return a;
  };
  const rowsOf = trk => v10.sh.findRows(c => c[1] === trk).map(r => r + ':w' + v10.sh.row(r)[3]);
  // 1. Vendor tracking: sent, the answer lost; the weight fixed on the card (4 → 9); sent again.
  both('vendor, first send', { rows: [box('v1', 'AMAZON', '4')], checkDupes: true });
  both('vendor, the fix sent again', { rows: [box('v1', 'AMAZON', '9')], checkDupes: true });
  if (rowsOf('AMAZON').join() !== '101:w4,102:w9') fail('vendor fix: rows ' + rowsOf('AMAZON').join() + ' (expected 101:w4,102:w9)');
  // 2. A misread tracking fixed on the card (…784 → …785) between the lost answer and the retry.
  both('tracking, first send', { rows: [box('t1', '1Z999AA10123456784', '4')], checkDupes: true });
  both('tracking, the fix sent again', { rows: [box('t1', '1Z999AA10123456785', '4')], checkDupes: true });
  if (rowsOf('1Z999AA10123456785').length !== 1) fail('the fixed tracking is not in the sheet: ' + rowsOf('1Z999AA10123456785'));
  // 3. The same real number sent again unchanged: the repeat check answers, as v9 does (the phone's repeat bar decides).
  const d = both('real number, sent again unchanged', { rows: [box('t1', '1Z999AA10123456785', '4')], checkDupes: true });
  if (!d.dupes) fail('an unchanged real number sent again got no repeat answer: ' + JSON.stringify(d));
  // 4. Unchecked sends (Send anyway, or a v37 retry of a vendor box): written each time, as v9 writes them.
  both('blank tracking, unchecked', { rows: [box('b1', '', '2')] });
  both('blank tracking, unchecked again', { rows: [box('b1', '', '2')] });
  if (v10.sh.findRows(c => c[0] === 'JOHN SMITH' && c[1] === '').length !== 2) fail('the unchecked retry of a blank tracking was not written as v9 writes it');
  // 5. Every send is remembered all the same: the phone, now on v38, sends the box again with rowsBack — its row comes
  //    back with what it holds, nothing is written.
  const n0 = v10.sh.findRows(() => true).length, last = rowsOf('AMAZON').slice(-1)[0];
  const r = v10.call({ op: 'append', rows: [box('v1', 'AMAZON', '9')], checkDupes: true, rowsBack: true });
  if (r.error || !r.placed || r.placed.length !== 1 || r.placed[0].id !== 'v1' || r.placed[0].row !== 102 || !Array.isArray(r.placed[0].cells) || r.placed[0].cells[3] !== '9')
    fail('a v38 retry after a v37 send: ' + JSON.stringify(r) + ' (expected row 102 back, ' + last + ')');
  if (v10.sh.findRows(() => true).length !== n0) fail('the v38 retry wrote a row');
  // 6. A v38 box, sent with the flag and sent again with it after a lost answer: the row comes back (F14), not written.
  const f1 = v10.call({ op: 'append', rows: [box('n1', 'DELIVERED BY ACME', '5')], checkDupes: true, rowsBack: true });
  const f2 = v10.call({ op: 'append', rows: [box('n1', 'DELIVERED BY ACME', '6')], checkDupes: true, rowsBack: true });
  if (!f1.placed || !f2.placed || f2.placed[0].row !== f1.placed[0].row || rowsOf('DELIVERED BY ACME').length !== 1 || f2.placed[0].cells[3] !== '5')
    fail('rowsBack retry: ' + JSON.stringify({ f1, f2, rows: rowsOf('DELIVERED BY ACME') }));
} catch (e) { fail(e.mine ? e.message : 'exception ' + (e.stack || e.message)); }
G6.report(NAME, ok, why);

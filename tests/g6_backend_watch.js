// F27 (backend): the watch list block is found where it is. Its cells, named WATCH_LIST (made once from the WATCH_RANGE
// script property), move with rows inserted or deleted above it: inserting rows as the "Not enough empty rows" message
// says lets sends go on, the names are still read, deleting a row above it neither stops sending nor drops a name, and a
// watch list block with no names is an error, never an empty list. With neither the named range nor WATCH_RANGE, the
// fixed rows of before still work and the message says how to fix it. (v9: fixed rows 9070…: sends stayed blocked after
// the insert and the list went empty.) Runs backend/Code.gs in node.
const G6 = require('./lib_g6.js');
const NAME = 'g6_backend_watch';
let ok = true, why = '';
const fail = m => { ok = false; why += m + '; '; };
const NAMES = ['JOHN SMITH (OWES MONEY)', 'MARIA LOPEZ (CALL OFFICE)', 'ACME TRADING', 'PETER JONES / PAUL JONES (ID CHECK)'];
const day = G6.today();
// A sheet whose log ends at `end` (the day's separator 60 rows up), the watch list names at B9070…
function world(end, props) {
  const be = G6.loadBackend({ props: Object.assign({ NEXT_ROW: String(end + 1), LAST_SEP: JSON.stringify({ row: end - 60, day }) }, props || {}) });
  G6.fillLog(be.sh, end - 60, [day], 60);
  for (let r = 8000; r < end - 60; r++) G6.boxRow(be.sh, r, G6.daysAgo(1), [`OLD ${r}`, `1Z${String(r).padStart(16, '0')}`, '1', '3', 'UPS', 'NO INVOICE', 'OLD (1 TOTAL)']);
  NAMES.forEach((n, i) => be.sh.set(9070 + i, 2, n));
  return be;
}
let n = 0;
const send = (be, customer) => be.call({ op: 'append', checkDupes: true, rows: [{ id: 'w' + (++n), day, cells: [customer, '9400' + String(100000000000 + n), '1', '3', 'UPS', 'NO INVOICE', 'SHOES (1 TOTAL)'] }] });
const names = be => be.call({ op: 'watch' });
try {
  // 0. Neither WATCH_LIST nor WATCH_RANGE: the fixed rows, as before.
  {
    const be = world(9000);
    const w = names(be), a = send(be, 'Bob Brown');
    if (JSON.stringify(w.names) !== JSON.stringify(NAMES)) fail('fixed: names ' + JSON.stringify(w));
    if (!a.placed || a.placed[0].row !== 9001) fail('fixed: send ' + JSON.stringify(a));
    if (be.ss.named.size) fail('fixed: a named range was made without WATCH_RANGE');
    // Full to the block: the message says how to get the inserted rows used.
    for (let r = 9002; r <= 9069; r++) G6.boxRow(be.sh, r, day, [`FILL ${r}`, `1Z${String(r).padStart(16, '0')}`, '1', '3', 'UPS', 'NO INVOICE', 'X (1 TOTAL)']);
    const e = send(be, 'Bob Brown');
    if (!e.error || !/row 9070/.test(e.error) || !/WATCH_LIST/.test(e.error)) fail('fixed, full: message ' + JSON.stringify(e));
  }
  // 1-2. WATCH_RANGE set: the block gets named WATCH_LIST; the log fills to it; rows inserted above it as the message
  //      says: sending goes on into them, and the names are still read.
  {
    const be = world(9060, { WATCH_RANGE: 'B9070:B9110' });
    const w0 = names(be), x = be.ss.getRangeByName('WATCH_LIST');
    if (!x || x.getA1Notation() !== 'B9070:B9110') fail('named range not made from WATCH_RANGE: ' + (x && x.getA1Notation()));
    if (JSON.stringify(w0.names) !== JSON.stringify(NAMES)) fail('named: names ' + JSON.stringify(w0));
    for (let r = 9061; r <= 9069; r++) G6.boxRow(be.sh, r, day, [`FILL ${r}`, `1Z${String(r).padStart(16, '0')}`, '1', '3', 'UPS', 'NO INVOICE', 'X (1 TOTAL)']);
    be.props.set('NEXT_ROW', '9070');
    const e = send(be, 'Bob Brown');
    if (!e.error || !/row 9070/.test(e.error)) fail('full log: ' + JSON.stringify(e));
    be.sh.insertRowsBefore(9070, 200);                  // what the office does
    const a = send(be, 'Bob Brown');
    if (a.error || !a.placed || a.placed[0].row !== 9070) fail('after inserting rows above the block: ' + JSON.stringify(a));
    const w1 = names(be);
    if (JSON.stringify(w1.names) !== JSON.stringify(NAMES)) fail('after inserting rows: names ' + JSON.stringify(w1));
    // Full again: the message names where the block is now.
    for (let r = 9071; r <= 9269; r++) G6.boxRow(be.sh, r, day, [`FILL ${r}`, `1Z${String(r).padStart(16, '0')}`, '1', '3', 'UPS', 'NO INVOICE', 'X (1 TOTAL)']);
    const e2 = send(be, 'Bob Brown');
    if (!e2.error || !/row 9270/.test(e2.error) || /WATCH_LIST/.test(e2.error)) fail('full again: ' + JSON.stringify(e2));
  }
  // 3. A row deleted by hand above the block, the log 9 rows short of it: sending goes on, no name is lost.
  {
    const be = world(9060, { WATCH_RANGE: 'B9070:B9110' });
    names(be);
    be.sh.deleteRows(8500, 1);
    const a = send(be, 'Bob Brown'), w = names(be);
    if (a.error || !a.placed || a.placed[0].row !== 9060) fail('after deleting a row above: ' + JSON.stringify(a));
    if (JSON.stringify(w.names) !== JSON.stringify(NAMES)) fail('after deleting a row above: names ' + JSON.stringify(w));
  }
  // 4. Ten rows deleted: the block is now above where the log ended last time (NEXT_ROW): never taken for the log.
  {
    const be = world(9065, { WATCH_RANGE: 'B9070:B9110' });
    names(be);
    be.sh.deleteRows(8500, 10);                         // log ends at 9055, block at 9060, NEXT_ROW still 9066
    const a = send(be, 'Bob Brown');
    if (a.error || !a.placed || a.placed[0].row !== 9056) fail('after deleting 10 rows above: ' + JSON.stringify(a));
    if (JSON.stringify(be.sh.row(9060)[1]) !== JSON.stringify(NAMES[0])) fail('the block was written over: B9060 = ' + be.sh.row(9060)[1]);
  }
  // 5. 50 rows inserted above the block ahead of time: still every name.
  {
    const be = world(9000, { WATCH_RANGE: 'B9070:B9110' });
    names(be);
    be.sh.insertRowsBefore(9050, 50);
    const w = names(be);
    if (JSON.stringify(w.names) !== JSON.stringify(NAMES)) fail('after inserting 50 rows ahead: names ' + JSON.stringify(w));
  }
  // 6. The named block with no names: an error the app can put on screen, never an empty list.
  {
    const be = world(9000, { WATCH_RANGE: 'B9070:B9110' });
    names(be);
    for (let i = 0; i < NAMES.length; i++) be.sh.set(9070 + i, 2, '');
    const w = names(be);
    if (!w.error || !/WATCH_LIST/.test(w.error) || w.names) fail('empty block: ' + JSON.stringify(w));
  }
  // 7. WATCH_LIST named on another tab: its row says nothing about this tab's log — an error, not a guess.
  {
    const be = world(9000);
    const other = be.ss.addSheet('NOTES');
    be.ss.setNamedRange('WATCH_LIST', other.getRange('B2:B20'));
    const a = send(be, 'Bob Brown');
    if (!a.error || !/WATCH_LIST/.test(a.error)) fail('WATCH_LIST on another tab: ' + JSON.stringify(a));
  }
} catch (e) { fail('exception ' + (e.stack || e.message)); }
G6.report(NAME, ok, why);

// R8 (backend): v10 finds the watch list block by its named range WATCH_LIST, which moves with rows inserted or deleted
// above it; backend v9 only knows the WATCH_RANGE and WATCH_START script properties. v10 keeps those two on where the
// block is (its cells without the tab, its first row), so after a rollback to v9 (Edit → Version 10 on the same sheet
// and properties) v9 reads the same names and the log goes on where it ends — never an empty watch list that lets every
// name through, nor tracking numbers taken for names with every send refused. Cases: (a) WATCH_LIST named by hand, 100
// rows inserted above the block ahead of time; (b) WATCH_RANGE property, the log reaches the block, 200 rows inserted
// as the message says, 60 boxes logged into them; (c) two rows deleted above the block. The properties are written only
// when the block moved, never without a WATCH_LIST (the fixed rows of before), never for one on another tab, and a
// write that fails never fails a request. Runs REPO's backend/Code.gs, then v9 (commit 087d4d5), in node.
// (Before: v10 never wrote them; after the rollback v9 read the old rows.)
const path = require('path');
const G6 = require('./lib_g6.js');
const NAME = 'r_R8_rollback';
let ok = true, why = '';
const fail = m => { ok = false; why += m + '; '; };
const day = G6.today();
const NAMES = ['JOHN SMITH (OWES MONEY)', 'MARIA LOPEZ (CALL OFFICE)', 'ACME TRADING (ID CHECK)'];
const V10 = path.join(process.env.REPO || require('path').resolve(__dirname, '..'), 'backend/Code.gs');
let k = 0;
const send = (be, customer) => be.call({ op: 'append', checkDupes: true, rowsBack: true, rows: [{ id: 'r' + (++k), day, cells: [customer, '9400' + String(100000000000 + k), '1', '3', 'UPS', 'NO INVOICE', 'SHOES (1 TOTAL)'] }] });
// The rollback: backend v9 on the same spreadsheet (named ranges included) and the same script properties.
function rollback(be10) {
  const be9 = G6.loadBackend({ src: G6.v9src(), props: Object.fromEntries(be10.props) });
  be9.ctx.SpreadsheetApp.openById = () => be10.ss;
  be9.ss = be10.ss; be9.sh = be10.sh;
  if (be9.version !== 9) throw new Error('setup: rollback to v' + be9.version);
  return be9;
}
function world(props, logEnd) {
  const be = G6.loadBackend({ file: V10, props: Object.assign({ NEXT_ROW: String(logEnd + 1), LAST_SEP: JSON.stringify({ row: 9000, day }) }, props) });
  G6.fillLog(be.sh, 9000, [day], logEnd - 9000);
  NAMES.forEach((n, i) => be.sh.set(9070 + i, 2, n));
  return be;
}
const named = be => { const r = be.ss.getRangeByName('WATCH_LIST'); return r ? r.getA1Notation() : null; };
const inStep = (be, tag) => {
  const w = be.ss.getRangeByName('WATCH_LIST');
  if (!w) return fail(`${tag}: no WATCH_LIST`);
  if (be.props.get('WATCH_RANGE') !== w.getA1Notation() || be.props.get('WATCH_START') !== String(w.getRow()))
    fail(`${tag}: WATCH_RANGE ${be.props.get('WATCH_RANGE')}, WATCH_START ${be.props.get('WATCH_START')} — WATCH_LIST is ${w.getA1Notation()}`);
};
const afterRollback = (be10, tag, logEnd, dayRows) => {
  const be9 = rollback(be10);
  const w = be9.call({ op: 'watch' });
  if (JSON.stringify(w.names) !== JSON.stringify(NAMES)) fail(`${tag}: v9 after the rollback reads the watch list as ${JSON.stringify(w).slice(0, 160)}`);
  const a = send(be9, 'JOHN SMITH');
  if (a.error || !a.placed || a.placed[0].row !== logEnd + 1) fail(`${tag}: v9 append after the rollback: ${JSON.stringify(a).slice(0, 200)} (the log ends at ${logEnd})`);
  if (dayRows != null) { const n = (be9.call({ op: 'dayRows', day }).rows || []).length; if (n < dayRows) fail(`${tag}: v9 dayRows lists ${n} of the day's ${dayRows} rows`); }
};
try {
  // (a) WATCH_LIST named by hand (option a); 100 rows inserted above the block ahead of time; 5 boxes; rollback.
  {
    const be = world({}, 9030);
    be.ss.setNamedRange('WATCH_LIST', be.sh.getRange('B9070:B9110'));
    be.sh.insertRowsBefore(9060, 100);
    for (let i = 0; i < 5; i++) { const r = send(be, 'CUST ' + i); if (r.error) throw new Error('setup (a): ' + r.error); }
    const w = be.call({ op: 'watch' });
    if (JSON.stringify(w.names) !== JSON.stringify(NAMES) || named(be) !== 'B9170:B9210') throw new Error('setup (a): v10 ' + JSON.stringify(w) + ' ' + named(be));
    inStep(be, '(a)');
    afterRollback(be, '(a)', 9035);
  }
  // (b) WATCH_RANGE property (option b); the log reaches the block; 200 rows inserted above it; 60 boxes; rollback.
  {
    const be = world({ WATCH_RANGE: 'B9070:B9110' }, 9060);
    for (let i = 0; i < 9; i++) send(be, 'FILL ' + i);  // the log to 9069
    const full = send(be, 'BOB BROWN');
    if (!full.error || !/row 9070/.test(full.error)) throw new Error('setup (b): not full: ' + JSON.stringify(full));
    be.sh.insertRowsBefore(9070, 200);
    for (let i = 0; i < 60; i++) { const r = send(be, 'AFTER ' + i); if (r.error) throw new Error('setup (b): ' + r.error); }
    if (named(be) !== 'B9270:B9310') throw new Error('setup (b): WATCH_LIST ' + named(be));
    inStep(be, '(b)');
    afterRollback(be, '(b)', 9129, 129);
  }
  // (c) WATCH_LIST named by hand; two rows deleted above the block (repeats removed); rollback.
  {
    const be = world({}, 9030);
    be.ss.setNamedRange('WATCH_LIST', be.sh.getRange('B9070:B9110'));
    be.sh.deleteRows(9010, 2);
    const w = be.call({ op: 'watch' });
    if (JSON.stringify(w.names) !== JSON.stringify(NAMES) || named(be) !== 'B9068:B9108') throw new Error('setup (c): v10 ' + JSON.stringify(w) + ' ' + named(be));
    inStep(be, '(c)');
    afterRollback(be, '(c)', 9028);
  }
  // Written only when the block moved: requests while it stays put write nothing.
  {
    const be = world({ WATCH_RANGE: 'B9070:B9110' }, 9030), writes = [], set = be.props.set.bind(be.props);
    be.props.set = (key, v) => { if (/^WATCH_/.test(key)) writes.push(key + '=' + v); return set(key, v); };
    be.call({ op: 'watch' }); const first = writes.length;
    for (let i = 0; i < 3; i++) { send(be, 'QUIET ' + i); be.call({ op: 'watch' }); be.call({ op: 'dayRows', day }); }
    if (writes.length !== first) fail('properties written again while the block stayed put: ' + writes.slice(first));
    be.sh.insertRowsBefore(9050, 10); be.call({ op: 'watch' });
    inStep(be, 'after 10 more rows');
  }
  // Never without a WATCH_LIST (the fixed rows of before), never for a WATCH_LIST on another tab.
  {
    const be = world({}, 9030);
    if (send(be, 'FIXED').error || be.call({ op: 'watch' }).error) fail('fixed rows: a request failed');
    if (be.props.has('WATCH_RANGE') || be.props.has('WATCH_START')) fail('fixed rows: properties written without a WATCH_LIST: ' + be.props.get('WATCH_RANGE') + ' ' + be.props.get('WATCH_START'));
    be.ss.setNamedRange('WATCH_LIST', be.ss.addSheet('NOTES').getRange('B2:B20'));
    const a = send(be, 'OTHER TAB');
    if (!a.error || !/WATCH_LIST/.test(a.error)) fail('WATCH_LIST on another tab: ' + JSON.stringify(a));
    if (be.props.has('WATCH_RANGE') || be.props.has('WATCH_START')) fail('WATCH_LIST on another tab: properties written');
  }
  // A property write that fails never fails a request.
  {
    const be = world({}, 9030), set = be.props.set.bind(be.props);
    be.ss.setNamedRange('WATCH_LIST', be.sh.getRange('B9070:B9110'));
    be.props.set = (key, v) => { if (/^WATCH_/.test(key)) throw new Error('Service invoked too many times: properties (test)'); return set(key, v); };
    const w = be.call({ op: 'watch' }), a = send(be, 'NO PROPS');
    if (w.error || JSON.stringify(w.names) !== JSON.stringify(NAMES) || a.error || !a.placed) fail('a failing property write failed a request: ' + JSON.stringify({ w, a }).slice(0, 200));
  }
} catch (e) { fail('exception ' + (e.stack || e.message)); }
G6.report(NAME, ok, why);

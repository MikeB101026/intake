// F17 (backend): dayRows gives every row of the day asked for, however far back the day starts (up to 3000 rows), and
// says where it started reading (from) — at about 250 rows a day, the day before yesterday starts more than 500 rows
// back, and its first rows used to be missing, so the app took them for "Not in sheet". A box of yesterday sent late
// among today's rows doesn't cut today short; past 3000 rows, from says how far it read. (v9: the last 500 rows, no
// from.) Runs backend/Code.gs in node.
const G6 = require('./lib_g6.js');
const NAME = 'g6_backend_dayrows';
let ok = true, why = '';
const fail = m => { ok = false; why += m + '; '; };
try {
  const days = []; for (let k = 14; k >= 0; k--) days.push(G6.daysAgo(k));   // 15 days, oldest first; today last
  const [D, D1, D3, D11] = [days[14], days[13], days[11], days[3]];
  const be = G6.loadBackend({ props: { NEXT_ROW: '3865' } });
  const sh = be.sh;
  const last = G6.fillLog(sh, 100, days, 250);            // day k: separator at 100 + 251k, its rows below
  if (last !== 3864) throw new Error('setup: log ends at ' + last);
  // A box of yesterday sent this morning, among today's rows (the backend writes no separator for an earlier day).
  G6.boxRow(sh, 3700, D1, ['LATE SENDER', '1Z0000000000LATE01', '1', '2', 'UPS', 'NO INVOICE', 'LATE THING (1 TOTAL)']);
  // Two photo links on one of D-3's rows.
  G6.boxRow(sh, 2900, D3, ['PIC OWNER', '1Z0000000000PICS01', '1', '2', 'UPS', 'NO INVOICE', 'PICTURED (1 TOTAL)'],
    [{ id: 'PICFILE1xxxxxxxxxxxxxxxxxx', label: 'LABEL 1' }, { id: 'PICFILE2xxxxxxxxxxxxxxxxxx', label: 'INSIDE 1' }]);
  const want = day => sh.findRows(c => c[7] === G6.shownDay(day) && !(c[0] === '' && /\d{4}$/.test(c[1])));   // the day's rows, not its separator
  const ask = day => { sh.reads.length = 0; const r = be.call({ op: 'dayRows', day }); if (r.error) throw new Error(r.error); return r; };
  const check = (label, day, r, from) => {
    const got = (r.rows || []).map(x => x.row), exp = want(day).filter(n => n >= (from || 0));
    if (JSON.stringify(got) !== JSON.stringify(exp)) fail(`${label}: ${got.length} rows (${got[0]}…${got[got.length - 1]}), the sheet has ${exp.length} (${exp[0]}…${exp[exp.length - 1]})`);
    if (from != null && r.from !== from) fail(`${label}: from ${r.from}, expected ${from}`);
  };
  // Today: its separator is in the last 500 rows — read once, from there.
  const rt = ask(D);
  check('today', D, rt, 3364);
  if (sh.reads.some(([r0]) => r0 < 3364)) fail('today: read further back than the last 500 rows ' + JSON.stringify(sh.reads));
  if ((rt.rows || []).some(x => x.cells[0] === 'LATE SENDER')) fail('today: yesterday’s late box listed as today’s');
  // Yesterday: starts just above the last 500 rows; its late box among today's rows is listed too.
  const ry = ask(D1);
  check('yesterday', D1, ry, 2864);
  if (!(ry.rows || []).some(x => x.row === 3700)) fail('yesterday: its late box (row 3700) missing');
  // The day before yesterday... three days back: starts about 1000 rows back — every row of it.
  const r3 = ask(D3);
  check('3 days back', D3, r3, 2364);
  const pr = (r3.rows || []).find(x => x.row === 2900);
  if (!pr || JSON.stringify(pr.pics) !== JSON.stringify([{ id: 'PICFILE1xxxxxxxxxxxxxxxxxx', label: 'LABEL 1' }, { id: 'PICFILE2xxxxxxxxxxxxxxxxxx', label: 'INSIDE 1' }])) fail('photo links of row 2900: ' + JSON.stringify(pr && pr.pics));
  if (!pr || pr.cells.length !== 8 || pr.cells[0] !== 'PIC OWNER' || pr.cells[7] !== G6.shownDay(D3)) fail('cells of row 2900: ' + JSON.stringify(pr && pr.cells));
  // Eleven days back starts more than 3000 rows back: read 3000, and from says so; the rows below it are all there.
  const r11 = ask(D11);
  check('11 days back', D11, r11, 864);
  if (!(r11.rows || []).length) fail('11 days back: none of its rows below the 3000 limit');
  // A day with no rows yet (tomorrow): nothing, and where the read started.
  const tm = G6.dateOf(D); tm.setDate(tm.getDate() + 1);
  const rn = ask(`${tm.getFullYear()}-${String(tm.getMonth() + 1).padStart(2, '0')}-${String(tm.getDate()).padStart(2, '0')}`);
  if ((rn.rows || []).length || !(rn.from >= 2)) fail('tomorrow: ' + JSON.stringify(rn).slice(0, 120));
} catch (e) { fail('exception ' + (e.stack || e.message)); }
G6.report(NAME, ok, why);

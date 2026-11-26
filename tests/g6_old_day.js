// F17 (backend v10, with the app): a busy sheet — about 480 rows yesterday — and this phone's first 10 boxes of the day
// before yesterday, sent correctly about 50 hours ago. The operator opens that day from the day list: every box stays
// "In sheet" on its row (none "Not in sheet — Send as a new row"), and every row of that day is listed. Backend and app
// are both REPO's (backend/Code.gs run in node). (v37 with backend v9: dayRows read only the last 500 rows, the day came
// back cut off at the top, and the 10 boxes above the cut were flagged "Not in sheet".)
const path = require('path');
const { start } = require('./h.js');
const G = require('./lib_g4.js'), L = G.L, G2 = require('./lib_g2.js'), G6 = require('./lib_g6.js');
const NAME = 'g6_old_day';
(async () => {
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const [D, D1, D2, D3] = [0, 1, 2, 3].map(n => G6.daysAgo(n));
  const be = G6.loadBackend({ props: { NEXT_ROW: '1518', LAST_SEP: JSON.stringify({ row: 1512, day: D }) } });
  const sh = be.sh;
  const other = (day, r) => [`OTHER ${r}`, `1Z${String(r).padStart(16, '0')}`, '1', '3', 'UPS', 'NO INVOICE', `THING ${r} (1 TOTAL)`];
  G6.sepRow(sh, 990, D3); for (let r = 991; r <= 999; r++) G6.boxRow(sh, r, D3, other(D3, r));
  G6.sepRow(sh, 1000, D2);
  const mine = [];
  for (let i = 0; i < 10; i++) {
    const r = 1001 + i, at = Date.now() - 50 * 3600000 + i * 60000;
    const b = G2.sentBox({ id: 'own' + i, seq: i + 1, day: D2, sheetRow: r, createdAt: at - 30000, sentAt: at, photos: [], photosLinked: true, savedIds: [],
      row: { customer: `OWN BOX ${i}`, tracking: `TBA${String(500000000000 + i)}`, weight: '4', contents: `OWN THING ${i} (1 TOTAL)` } });
    G6.boxRow(sh, r, D2, b.sentCells.slice(0, 7));
    mine.push(b);
  }
  for (let r = 1011; r <= 1030; r++) G6.boxRow(sh, r, D2, other(D2, r));
  G6.sepRow(sh, 1031, D1); for (let r = 1032; r <= 1511; r++) G6.boxRow(sh, r, D1, other(D1, r));
  G6.sepRow(sh, 1512, D); for (let r = 1513; r <= 1517; r++) G6.boxRow(sh, r, D, other(D, r));
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: G6.harnessBackend(be, ctl) });
  try {
    await L.waitFor(t, 'PACE.ready || PACE.off', 15000); await G.idle(t);
    await G.setLs(t, { nextRowSeen: '1518' });
    await G2.inject(t, [], mine);
    await G.reload(t);
    // The day list: the day before yesterday.
    await t.page.selectOption('#daySel', D2);
    await L.waitFor(t, `S.day === ${JSON.stringify(D2)}`, 5000);
    await t.page.waitForTimeout(300); await G.idle(t, 60000);
    const bs = (await G.boxes(t)).filter(b => b.day === D2);
    const wrong = bs.filter(b => b.wrongRow || b.view === 'wrong');
    if (wrong.length) fail(`${wrong.length} correctly sent boxes flagged "Not in sheet": #${wrong.map(b => b.seq).join(', #')}`);
    const own = bs.filter(b => !b.imported);
    if (own.length !== 10 || own.some(b => b.view !== 'sent' || b.sheetRow !== 1001 + (b.seq - 1))) fail('own boxes: ' + JSON.stringify(own.map(b => [b.seq, b.sheetRow, b.view])));
    const rows = new Set(bs.map(b => b.sheetRow));
    const missing = []; for (let r = 1001; r <= 1030; r++) if (!rows.has(r)) missing.push(r);
    if (missing.length) fail(`rows of that day not listed: ${missing[0]}…${missing[missing.length - 1]} (${missing.length})`);
    if (bs.length !== 30) fail(`${bs.length} cards for a day of 30 rows`);
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.stack || e.message).split('\n').slice(0, 3).join(' ')); }
  finally { await t.close(); }
  G6.report(NAME, ok, why);
})();

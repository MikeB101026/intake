// F14 (app + backend v10): a box's send goes into the sheet but the answer is lost; the operator corrects the weight on
// the card and taps Send again. The app asks for the row back (rowsBack: true, R13), so backend v10 hands back the row
// the first try wrote (nothing written twice), with what the row holds. The box must end on that row as "Changed" — its
// weight correction kept for Update sheet row — and the 30-s sync must not put the row's old weight back on the card.
// Update then writes it. The backend is REPO's backend/Code.gs run in node; the app is REPO's. (A v37 app doesn't ask:
// v10 writes its retry as a second row, as v9 does — see r_R13_v37_phone.)
const path = require('path');
const { start } = require('./h.js');
const G = require('./lib_g4.js'), L = G.L, G6 = require('./lib_g6.js'), G5 = require('./lib_g5.js');
const NAME = 'g6_append_again';
(async () => {
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const day = G6.today();
  const be = G6.loadBackend({ file: path.join(process.env.REPO || require('path').resolve(__dirname, '..'), 'backend/Code.gs'), props: { NEXT_ROW: '100', LAST_SEP: JSON.stringify({ row: 99, day }) } });
  G6.sepRow(be.sh, 99, day);
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: G6.harnessBackend(be, ctl) });
  try {
    await L.waitFor(t, 'PACE.ready || PACE.off', 15000); await G.idle(t);
    await G.setLs(t, { autoSend: '0', nextRowSeen: '100' });
    await G.seed(t, [G.readyBox({ id: 'tba', seq: 1, row: { customer: 'JOHN SMITH', tracking: 'TBA111111111111', weight: '4' } })]);
    const rows = () => be.sh.findRows(c => c[1] === 'TBA111111111111');
    // The row goes in; the answer never reaches the phone.
    ctl.lose.append = 1;
    await t.ev('planSend([S.boxes.get("tba")])'); await G.idle(t);
    const b0 = await G.box(t, 'tba');
    if (rows().length !== 1 || b0.sheetRow) throw new Error('setup: rows ' + rows() + ', sheetRow ' + b0.sheetRow);
    // The operator fixes the weight on the card, then taps Send again.
    await G5.typeField(t, 'tba', 'weight', '9');
    await G.idle(t);
    await t.ev('planSend([S.boxes.get("tba")])'); await G.idle(t);
    const b1 = await G.box(t, 'tba');
    if (rows().length !== 1) fail('written ' + rows().length + ' times');
    if (b1.sheetRow !== rows()[0]) fail('not on its row: sheetRow ' + b1.sheetRow + ', row ' + rows()[0]);
    if (b1.row.weight !== '9' || b1.view !== 'dirty') fail(`after the send: weight ${b1.row.weight}, ${b1.view} (expected 9, Changed)`);
    // The 30-s sync: the sheet still says 4 — the card keeps 9, and stays Changed.
    await t.ev('syncDay()'); await G.idle(t);
    const b2 = await G.box(t, 'tba');
    if (b2.row.weight !== '9' || b2.view !== 'dirty') fail(`after the sync: weight ${b2.row.weight}, ${b2.view}`);
    // Update sheet row writes it.
    if (await t.ev('$("#sendBtn").dataset.mode') !== 'update') fail('no Update button: ' + await t.ev('$("#sendBtn").textContent'));
    else {
      await t.page.click('#sendBtn'); await G.idle(t);
      const b3 = await G.box(t, 'tba'), r = be.sh.row(rows()[0]);
      if (r[3] !== '9' || b3.view !== 'sent') fail(`after Update: sheet weight ${r[3]}, ${b3.view}`);
    }
    if (rows().length !== 1) fail('rows at the end ' + rows());
    const asks = ctl.bodies.filter(b => b.op === 'append');
    if (asks.length < 2 || asks.some(b => b.rowsBack !== true)) fail('append sent without rowsBack: ' + JSON.stringify(asks.map(b => b.rowsBack)));
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.stack || e.message).split('\n').slice(0, 3).join(' ')); }
  finally { await t.close(); }
  G6.report(NAME, ok, why);
})();

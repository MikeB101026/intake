// R13 (backend v10 with a phone still on v37): a send goes into the sheet but its answer is lost; the operator fixes the
// card and taps Send again. v37 doesn't ask for the row back, so backend v10 writes the retry as v9 did: the fix is in
// the sheet as a second row, and the card keeps it after the 30-s sync — never put back to the old value without a word.
// Case a: vendor tracking AMAZON, weight 4 → 9. Case b: a misread tracking …784 → …785 (its photos then save on the
// fixed row). The app is v37 (commit 087d4d5, built here), the backend REPO's backend/Code.gs run in node. (Before: v10
// handed the first row back, v37 noted the fix as sent, the sync put 4 / …784 back on the card, and in case b every
// photo save failed with "Sheet row 100 no longer holds this box.")
const path = require('path'), fs = require('fs'), cp = require('child_process');
const { start } = require('./h.js');
const G = require('./lib_g4.js'), L = G.L, G6 = require('./lib_g6.js'), G5 = require('./lib_g5.js');
const NAME = 'r_R13_v37_phone';
const PORT = +process.env.PORT || 10810;
const V37 = path.join(__dirname, 'v37app-' + PORT);
async function run(kase, port) {
  const day = G6.today();
  const be = G6.loadBackend({ file: path.join(process.env.REPO || require('path').resolve(__dirname, '..'), 'backend/Code.gs'), props: { NEXT_ROW: '100', LAST_SEP: JSON.stringify({ row: 99, day }) } });
  G6.sepRow(be.sh, 99, day);
  const ctl = {};
  const t = await start({ repo: V37, port, backend: G6.harnessBackend(be, ctl) });
  const out = { kase, version: be.version };
  const trk0 = kase === 'b' ? '1Z999AA10123456784' : 'AMAZON', trk1 = kase === 'b' ? '1Z999AA10123456785' : 'AMAZON';
  const rows = () => be.sh.findRows(c => c[0] === 'JOHN SMITH').map(r => ({ row: r, trk: be.sh.row(r)[1], w: be.sh.row(r)[3], linked: /HYPERLINK/.test(String(be.sh.get(r, 48) || '')) }));
  const card = async () => (b => ({ sheetRow: b.sheetRow, trk: b.row.tracking, w: b.row.weight, view: b.view }))(await G.box(t, 'bx'));
  const tapSend = async () => { await G.G2.expand(t, 'bx'); await t.page.click('[data-id="bx"] [data-act="send1"]'); };
  try {
    await L.waitFor(t, 'PACE.ready || PACE.off', 15000); await G.idle(t);
    await G.setLs(t, { autoSend: '0', nextRowSeen: '100' });
    await G.seed(t, [G.readyBox({ id: 'bx', seq: 1, row: { customer: 'JOHN SMITH', tracking: trk0, weight: '4' } })]);
    ctl.lose.append = 1;                                 // the first send goes in; its answer never reaches the phone
    await tapSend(); await G.idle(t);
    if (rows().length !== 1 || (await G.box(t, 'bx')).sheetRow) throw new Error('setup: ' + JSON.stringify({ rows: rows(), card: await card() }));
    if (kase === 'b') await G5.typeField(t, 'bx', 'tracking', trk1); else await G5.typeField(t, 'bx', 'weight', '9');
    await G.idle(t);
    await tapSend(); await G.idle(t, 60000);
    out.afterSend = { rows: rows(), card: await card() };
    await t.ev('syncDay()'); await G.idle(t, 60000);   // the 30-s sync
    out.afterSync = { rows: rows(), card: await card(), linkError: await t.ev('S.boxes.get("bx").linkError || ""') };
    out.errs = G.pageErrors(t);
  } catch (e) { out.exception = String(e.stack || e.message).split('\n').slice(0, 3).join(' '); }
  finally { await t.close(); }
  return out;
}
(async () => {
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    fs.rmSync(V37, { recursive: true, force: true }); fs.mkdirSync(V37, { recursive: true });
    cp.execSync(`git -C ${JSON.stringify(require("path").resolve(__dirname, ".."))} archive 087d4d5 | tar -x -C ${JSON.stringify(V37)}`);   // v37, live (main before the merge)
    if (!/intake-v37/.test(fs.readFileSync(path.join(V37, 'sw.js'), 'utf8'))) throw new Error('setup: 087d4d5 is not the v37 app');
    const a = await run('a', PORT), b = await run('b', PORT + 1);
    if (process.env.VERBOSE) console.log(JSON.stringify({ a, b }, null, 1));
    for (const o of [a, b]) {
      if (o.exception) { fail(`case ${o.kase}: exception ${o.exception}`); continue; }
      if (o.version !== 10) fail(`case ${o.kase}: backend v${o.version}`);
      if (o.errs.length) fail(`case ${o.kase}: page errors ${JSON.stringify(o.errs)}`);
    }
    // a: the weight fix is in the sheet (a second row, as with v9) and stays on the card.
    if (!a.exception) {
      const fixRow = a.afterSync.rows.find(r => r.w === '9');
      if (!fixRow) fail('a: the weight fix (9) is not in the sheet: ' + JSON.stringify(a.afterSync.rows));
      else if (a.afterSync.card.sheetRow !== fixRow.row) fail(`a: the card is on row ${a.afterSync.card.sheetRow}, the fix on row ${fixRow.row}`);
      if (a.afterSync.card.w !== '9') fail(`a: after the sync the card says weight ${a.afterSync.card.w} (the fix was put back without a word)`);
    }
    // b: the tracking fix is in the sheet, stays on the card, and the photos save on its row.
    if (!b.exception) {
      const fixRow = b.afterSync.rows.find(r => r.trk === '1Z999AA10123456785');
      if (!fixRow) fail('b: the tracking fix is not in the sheet: ' + JSON.stringify(b.afterSync.rows));
      else {
        if (b.afterSync.card.sheetRow !== fixRow.row) fail(`b: the card is on row ${b.afterSync.card.sheetRow}, the fix on row ${fixRow.row}`);
        if (!fixRow.linked || b.afterSync.linkError) fail(`b: photos on the fixed row: linked ${fixRow.linked}, error "${b.afterSync.linkError}"`);
      }
      if (b.afterSync.card.trk !== '1Z999AA10123456785') fail(`b: after the sync the card says ${b.afterSync.card.trk} (the fix was put back without a word)`);
    }
  } catch (e) { fail('exception ' + String(e.stack || e.message).split('\n').slice(0, 3).join(' ')); }
  finally { fs.rmSync(V37, { recursive: true, force: true }); }
  L.report(NAME, ok, why);
})();

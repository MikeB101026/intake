// F11: two pallets of one freight delivery carry the same BOL number, one logged on each phone. (1) This phone's pallet
// is sent for the first time just after the other phone's went into the sheet: it must not be "adopted" onto that row
// (v37: "already in the sheet … nothing written twice", its photos replaced the other pallet's links, and the next sync
// turned its card into the other pallet). (2) A pallet whose send failed must not be adopted by the sync onto the next
// row another phone writes with that number.
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'g4_same_bol';
(async () => {
  const ctl = { start: 119 };
  const t = await G.begin(ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const bol = 'DELIVERED BY ESTES BOL: 55512345', bol2 = 'DELIVERED BY ESTES BOL: 77788899';
    await G.setLs(t, { autoSend: '0', nextRowSeen: '120' });
    await G.seed(t, [G.readyBox({ id: 'p2', seq: 1, row: { customer: 'NINA COLE', tracking: bol, weight: '80', shipper: 'ESTES', contents: 'DINING TABLE (1 TOTAL)' } }),
      G.readyBox({ id: 'p3', seq: 2, row: { customer: 'OTTO PIKE', tracking: bol2, weight: '95', shipper: 'ESTES', contents: 'SOFA (1 TOTAL)' } })]);
    await G.idle(t);
    // (1) the other phone's pallet 1 goes in after this phone last looked; then auto-send sends pallet 2 (first try)
    const theirs = [{ id: 'PALLETONEPHOTOxxxxxxxxxxx', label: 'LABEL 1' }];
    ctl.sheet.set(120, G.sheetRow(G.today(), ['NINA COLE', bol, '1', '75', 'ESTES', 'NO INVOICE', 'DINING CHAIR (4 TOTAL)'], theirs));
    await t.ev('planSend([S.boxes.get("p2")], true)'); await G.idle(t);   // as auto-send does it
    let p2 = await G.box(t, 'p2');
    if (p2.sheetRow === 120) fail('pallet 2 adopted onto pallet 1\'s row 120: ' + await G.noticeText(t));
    if (JSON.stringify(ctl.sheet.get(120).pics) !== JSON.stringify(theirs)) fail('pallet 1\'s photo links replaced');
    await t.ev('syncDay()'); await G.idle(t);
    p2 = await G.box(t, 'p2');
    if (p2.row.weight !== '80' || p2.row.contents !== 'DINING TABLE (1 TOTAL)') fail('pallet 2\'s card now shows ' + p2.row.weight + ' lb / ' + p2.row.contents);
    // (2) pallet 3's send never reaches the backend; then the other phone writes a pallet with the same number
    ctl.fail = ['append'];
    await t.ev('planSend([S.boxes.get("p3")])'); await G.idle(t);
    ctl.fail = [];
    ctl.sheet.set(121, G.sheetRow(G.today(), ['OTTO PIKE', bol2, '1', '50', 'ESTES', 'NO INVOICE', 'ARMCHAIR (1 TOTAL)'], [{ id: 'OTHERPALLETPHOTOxxxxxxxxxx', label: 'LABEL 1' }]));
    await t.ev('syncDay()'); await G.idle(t);
    const p3 = await G.box(t, 'p3');
    if (p3.sheetRow === 121) fail('pallet 3 adopted by the sync onto the other phone\'s row 121');
    if (p3.row.weight !== '95') fail('pallet 3\'s card now shows ' + p3.row.weight + ' lb');
    if (!(await G.boxes(t)).some(b => b.imported && b.sheetRow === 121)) fail('row 121 not shown as the other phone\'s box');
    // (3) pallet 4's row went in but the answer was lost; the other phone then writes its pallet with the same number,
    // so the repeat check names that newer row: tapping Send again must find pallet 4's own row, not take the other one
    const bol3 = 'DELIVERED BY ESTES BOL: 44433322';
    await t.ev(`saveBox(Object.assign(structuredClone(S.boxes.get("p3")), { id: "p4", seq: 9, row: { customer: "PIA LUND", tracking: "${bol3}", pieces: 1, weight: "30", shipper: "ESTES", invoice: false, contents: "LAMP (1 TOTAL)" },
      status: "read", ok: true, sheetRow: null, sentCells: null, wrongRow: false, photosLinked: false, photos: [] })).then(() => 1)`);
    await t.ev('delete S.boxes.get("p4").sendTry, 1');
    ctl.lose.append = 1;
    await t.ev('planSend([S.boxes.get("p4")])'); await G.idle(t);
    const mine = G.rowsWith(ctl, bol3)[0];
    ctl.sheet.set(mine + 1, G.sheetRow(G.today(), ['PIA LUND', bol3, '1', '28', 'ESTES', 'NO INVOICE', 'LAMP SHADE (1 TOTAL)'], [{ id: 'PIAOTHERPHOTOxxxxxxxxxxxx', label: 'LABEL 1' }]));
    await t.ev('planSend([S.boxes.get("p4")])'); await G.idle(t);
    const p4 = await G.box(t, 'p4');
    if (p4.sheetRow !== mine) fail(`pallet 4 at row ${p4.sheetRow}, its own row is ${mine} (the other phone's is ${mine + 1})`);
    if (G.rowsWith(ctl, bol3).length !== 2) fail('pallet 4 written again');
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

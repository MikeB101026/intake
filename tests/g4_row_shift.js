// F10: today's rows are JOHN (107), MARY (108, photos not saved yet) and PETER (109); KAY's card (110) was deleted on
// this phone. Someone deletes an old row above them in the sheet, so every row moves up one. Each card must follow its
// tracking to its row: no card takes its neighbour's data, no row comes back as an extra card, KAY's stays hidden, and
// MARY's photos go to MARY's row (v37: by row number — JOHN's card turned into MARY, MARY's into PETER, JOHN came back
// as a new card, and MARY's photos replaced PETER's links). Then a row is inserted above them: nothing is flagged
// "Not in sheet" (v37 flagged the day's first box).
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'g4_row_shift';
(async () => {
  const ctl = { start: 110 };
  const t = await G.begin(ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const day = G.today(), who = { j: ['JOHN SMITH', 'TBA111111111111', 107], m: ['MARY JONES', 'TBA222222222222', 108], p: ['PETER PAN', 'TBA333333333333', 109], k: ['KAY MOSS', 'TBA444444444444', 110] };
    const pics = id => [{ id: id.toUpperCase() + 'LINKEDPHOTOxxxxxxxxxxxx', label: 'LABEL 1' }];
    ctl.sheet.set(100, G.sheetRow(G.daysAgo(3), ['OLD DUPLICATE', 'TBA999999999999', '1', '1', 'AMAZON', 'NO INVOICE', ''], []));
    const bx = [];
    let seq = 0;
    for (const [id, [customer, tracking, row]] of Object.entries(who)) {
      const b = G.G2.sentBox({ id, seq: ++seq, sheetRow: row, row: { customer, tracking, weight: String(seq + 3) }, photosLinked: id !== 'm' });
      if (id === 'm') Object.assign(b, { linkError: 'No connection to the backend. Check your signal and try again.', linkErrAt: Date.now() });
      bx.push(b);
      ctl.sheet.set(row, G.sheetRow(day, b.sentCells.slice(0, 7), id === 'm' ? [] : pics(id)));
    }
    ctl.fail = ['photos'];                             // MARY's photos can't be saved yet
    await G.setLs(t, { autoSend: '0', nextRowSeen: '111' });
    await G.seed(t, bx);
    await G.idle(t);
    await t.ev('deleteBox("k")'); await G.idle(t);
    // the office deletes the old row 100: every row below moves up one
    G.deleteRow(ctl, 100);
    await t.ev('syncDay()'); await G.idle(t);
    const all = await G.boxes(t), by = id => all.find(b => b.id === id);
    for (const id of ['j', 'm', 'p']) {
      const b = by(id), [customer, , row] = who[id];
      if (b.customer !== customer) fail(`card ${id} now shows ${b.customer}`);
      if (b.sheetRow !== row - 1) fail(`card ${id} (${customer}) points at row ${b.sheetRow}, its row is ${row - 1}`);
    }
    const extra = all.filter(b => b.imported);
    if (extra.length) fail('extra cards: ' + extra.map(b => `#${b.seq} ${b.customer} row ${b.sheetRow}`).join(', '));
    // MARY's photos are saved now
    ctl.fail = [];
    await t.ev('unlinked().forEach(b => { delete b.linkError; queueLinks(b.id); }), 1');
    await G.idle(t);
    if (!ctl.uploads.some(u => u.row === 107) || ctl.sheet.get(107).cells[0] !== 'MARY JONES') fail('MARY\'s photos not saved to her row 107: ' + JSON.stringify(ctl.uploads));
    if (JSON.stringify(ctl.sheet.get(108).pics) !== JSON.stringify(pics('p'))) fail('PETER\'s links (row 108) replaced');
    // a row is inserted above them: every row moves down one
    G.insertRow(ctl, 101, null);
    await t.ev('syncDay()'); await G.idle(t);
    const all2 = await G.boxes(t);
    for (const id of ['j', 'm', 'p']) {
      const b = all2.find(x => x.id === id), [customer, , row] = who[id];
      if (b.wrongRow || b.view === 'wrong') fail(`card ${id} flagged "Not in sheet" after the insert`);
      if (b.customer !== customer || b.sheetRow !== row) fail(`after the insert card ${id} shows ${b.customer} at row ${b.sheetRow}`);
    }
    if (all2.some(b => b.imported)) fail('extra cards after the insert');
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

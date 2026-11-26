// F14: a box with no unique tracking number (a vendor name, a blank tracking) whose row went into the sheet but whose
// answer was lost. (1) The sync must recognise that row as the box's own (v37 brought it back as another phone's card
// and left the box Ready, so the next Send wrote it twice). (2) Send tapped again right away, before any sync, must not
// write it twice either (v37: the repeat check can't find a vendor name or a blank, so a second row went in).
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'g4_vendor_lost';
const rowsOf = (ctl, customer) => [...ctl.sheet.entries()].filter(([n, r]) => r.cells[0] === customer).map(([n]) => n);
(async () => {
  const ctl = { start: 106 };
  const t = await G.begin(ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await G.setLs(t, { autoSend: '0', nextRowSeen: '107' });
    await G.seed(t, [
      G.readyBox({ id: 'acme', seq: 1, row: { customer: 'KAY MOSS', tracking: 'DELIVERED BY ACME FURNITURE', weight: '40', shipper: 'ACME FURNITURE', contents: 'DINING CHAIR (2 TOTAL)' } }),
      G.readyBox({ id: 'fbs', seq: 2, row: { customer: 'LEE ROY', tracking: 'DELIVERED BY FLORIDA BUILDING SUPPLY', weight: '60', shipper: 'FBS', contents: 'TILE BOX (4 TOTAL)' } }),
      G.readyBox({ id: 'blank', seq: 3, row: { customer: 'MAY DAY', tracking: '', weight: '2', contents: 'ECHO FAN (1 TOTAL)' } })]);
    await G.idle(t);
    // (1) the row goes in, the answer is lost; the 30-s sync comes; then the operator taps Send again
    ctl.lose.append = 1;
    await t.ev('planSend([S.boxes.get("acme")])');
    await G.idle(t);
    if (rowsOf(ctl, 'KAY MOSS').length !== 1) fail('setup: KAY MOSS rows ' + rowsOf(ctl, 'KAY MOSS'));
    await t.ev('syncDay()'); await G.idle(t);
    const imported = (await G.boxes(t)).filter(b => b.imported && b.customer === 'KAY MOSS');
    if (imported.length) fail('its own row came back as another phone\'s card #' + imported[0].seq);
    const a = await G.box(t, 'acme');
    if (a.sheetRow !== rowsOf(ctl, 'KAY MOSS')[0]) fail('the sync didn\'t take the row as KAY MOSS\'s own (sheetRow ' + a.sheetRow + ', ' + a.view + ')');
    await t.ev('planSend([S.boxes.get("acme")])'); await G.idle(t);
    if (rowsOf(ctl, 'KAY MOSS').length !== 1) fail('KAY MOSS written ' + rowsOf(ctl, 'KAY MOSS').length + ' times');
    // (2) same, but Send is tapped again before any sync — a vendor name, then a blank tracking
    for (const [id, who] of [['fbs', 'LEE ROY'], ['blank', 'MAY DAY']]) {
      ctl.lose.append = 1;
      await t.ev(`planSend([S.boxes.get("${id}")])`); await G.idle(t);
      await t.ev(`planSend([S.boxes.get("${id}")])`); await G.idle(t);
      const b = await G.box(t, id), rs = rowsOf(ctl, who);
      if (rs.length !== 1) fail(`${who} written ${rs.length} times (rows ${rs})`);
      else if (b.sheetRow !== rs[0]) fail(`${who} not marked as sent at its row (${b.sheetRow}, ${b.view})`);
    }
    const n0 = ctl.sheet.size;
    await t.ev('syncDay()'); await G.idle(t);
    if ((await G.boxes(t)).some(b => b.imported)) fail('a row of this phone came back as another phone\'s card');
    if (ctl.sheet.size !== n0) fail('the sync wrote rows?');
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

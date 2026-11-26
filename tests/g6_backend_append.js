// F14 (backend): a box whose send reply got lost and is sent again is never written a second time, whatever its
// tracking (vendor name, blank, short number) and even when the card was changed in between: append knows the box
// (by its id) and hands back its row with what the row holds. Two different boxes that look the same still get a row
// each, a row that no longer holds the box (a row deleted above it moved another box onto it) is never taken for it,
// and a cache that fails never fails a send. (v9: the retry wrote a second row.) Every append here asks for the row
// back (rowsBack: true), as the v38 app does; without it, see r_R13_rows_back. Runs backend/Code.gs in node.
const G6 = require('./lib_g6.js');
const NAME = 'g6_backend_append';
let ok = true, why = '';
const fail = m => { ok = false; why += m + '; '; };
try {
  const day = G6.today();
  const be = G6.loadBackend({ props: { NEXT_ROW: '121', LAST_SEP: JSON.stringify({ row: 100, day }) } });
  const sh = be.sh;
  G6.sepRow(sh, 100, day);
  for (let r = 101; r <= 120; r++) G6.boxRow(sh, r, day, [`CUSTOMER ${r}`, `1Z${String(r).padStart(16, '0')}`, '1', '3', 'UPS', 'NO INVOICE', `THING ${r} (1 TOTAL)`]);
  const rowsWith = trk => sh.findRows(c => c[1] === trk);
  const box = (id, customer, tracking, weight, contents) => ({ id, day, cells: [customer, tracking, '1', weight || '4', 'FLORIDA BUILDING SUPPLY', 'NO INVOICE', contents || 'DOOR (1 TOTAL)'] });
  const append = (rows, checkDupes) => { const r = be.call({ op: 'append', rows, checkDupes, rowsBack: true }); if (r.error) fail('append error: ' + r.error); return r; };

  // 1. Vendor truck, no number: the first send is written, its answer lost; the retry (unchecked, as the app sends it
  //    once it has dropped the vendor-name hit) gets the same row back.
  const v = box('b1', 'John Smith', 'DELIVERED BY FLORIDA BUILDING SUPPLY');
  const r1 = append([v], true);
  const row1 = r1.placed && r1.placed[0] && r1.placed[0].row;
  if (!row1) fail('setup: first send placed nothing ' + JSON.stringify(r1));
  const next1 = be.props.get('NEXT_ROW');
  const r2 = append([v], false);
  if (rowsWith('DELIVERED BY FLORIDA BUILDING SUPPLY').length !== 1) fail('vendor box written twice: rows ' + rowsWith('DELIVERED BY FLORIDA BUILDING SUPPLY'));
  if (!r2.placed || r2.placed.length !== 1 || r2.placed[0].id !== 'b1' || r2.placed[0].row !== row1) fail('retry not given its row back: ' + JSON.stringify(r2));
  else if (!Array.isArray(r2.placed[0].cells) || r2.placed[0].cells[0] !== 'JOHN SMITH' || G6.shownDay(day) !== r2.placed[0].cells[7]) fail('retry reply lacks the row’s cells: ' + JSON.stringify(r2.placed[0]));
  if (be.props.get('NEXT_ROW') !== next1) fail('NEXT_ROW moved on a retry that wrote nothing');
  if (!(r2.nextRow > row1)) fail('retry reply has no nextRow past the row: ' + JSON.stringify(r2));
  // ... and a checked retry (the app's first call on a Send tap) too.
  const r2b = append([v], true);
  if (r2b.dupes || !r2b.placed || r2b.placed[0].row !== row1 || rowsWith('DELIVERED BY FLORIDA BUILDING SUPPLY').length !== 1) fail('checked retry: ' + JSON.stringify(r2b));

  // 2. Blank tracking (never a repeat): the checked retry used to write directly.
  const b = box('b2', 'Mary Jones', '');
  const r3 = append([b], true), row3 = r3.placed && r3.placed[0] && r3.placed[0].row;
  const r4 = append([b], true);
  const maryRows = sh.findRows(c => c[0] === 'MARY JONES');
  if (maryRows.length !== 1 || !r4.placed || r4.placed[0].row !== row3) fail('blank tracking written twice: ' + JSON.stringify({ maryRows, r4 }));

  // 3. Short number, and the weight corrected on the card before the retry: still the one row, and the reply says what
  //    the row holds (the weight sent first), so the app can show the change as "Changed".
  const s1 = box('b3', 'Peter Pan', '123456', '4');
  const r5 = append([s1], true), row5 = r5.placed && r5.placed[0] && r5.placed[0].row;
  const r6 = append([box('b3', 'Peter Pan', '123456', '7')], true);
  if (rowsWith('123456').length !== 1) fail('short number written twice after a card change: ' + rowsWith('123456'));
  if (!r6.placed || r6.placed[0].row !== row5 || r6.placed[0].cells[3] !== '4') fail('changed retry: ' + JSON.stringify(r6));

  // 4. Two boxes off the same truck for the same customer, the same in every cell: one row each.
  const t1 = box('b4', 'Anna Lee', 'PICK UP BY 700 ISLANDS'), t2 = box('b5', 'Anna Lee', 'PICK UP BY 700 ISLANDS');
  append([t1], false); append([t2], false);
  if (rowsWith('PICK UP BY 700 ISLANDS').length !== 2) fail('two different boxes got ' + rowsWith('PICK UP BY 700 ISLANDS').length + ' rows');

  // 5. A row deleted above by hand moves the next box (same customer, truck and day) onto the cached row number: the
  //    retry must never be handed that other box's row.
  const a = box('b6', 'Kay Moss', 'DELIVERED BY ACME FURNITURE', '5', 'SOFA (1 TOTAL)'), c = box('b7', 'Kay Moss', 'DELIVERED BY ACME FURNITURE', '5', 'CHAIR (2 TOTAL)');
  const ra = append([a], false), rowA = ra.placed[0].row;
  append([c], false);
  sh.deleteRows(105, 1);                                // the office removes a row above both
  const chairRow = sh.findRows(x => x[6] === 'CHAIR (2 TOTAL)')[0];
  const before = sh.row(chairRow).join('|');
  const rr = append([a], false);
  if (chairRow !== rowA) fail('setup: the chair box did not move onto the cached row (' + chairRow + ' vs ' + rowA + ')');
  if (rr.placed && rr.placed.some(p => p.row === chairRow)) fail('retry was handed another box’s row ' + chairRow);
  if (sh.row(chairRow).join('|') !== before) fail('the other box’s row changed');

  // 6. The cache failing never fails a send (rows go in as before v10).
  be.cache.fail = true;
  const rf = be.call({ op: 'append', rows: [box('b8', 'Lee Roy', '1Z999AA10123456784')], checkDupes: true, rowsBack: true });
  if (rf.error || !rf.placed || rf.placed.length !== 1) fail('send with the cache down: ' + JSON.stringify(rf));
  be.cache.fail = false;

  // 7. The reply's shape for a plain new row is unchanged.
  const rn = append([box('b9', 'Nina Simone', '1Z999AA10123456791')], true);
  if (!rn.placed || rn.placed.length !== 1 || Object.keys(rn.placed[0]).sort().join() !== 'id,row' || !(rn.nextRow > rn.placed[0].row)) fail('plain append reply: ' + JSON.stringify(rn));
  if (be.version < 10) fail('backend version ' + be.version);
} catch (e) { fail('exception ' + (e.stack || e.message)); }
G6.report(NAME, ok, why);

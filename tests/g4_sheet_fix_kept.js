// F15: box #1 went into the sheet with its customer misread ("JOHN SMTIH"); the office fixes it to "JOHN SMITH" in the
// sheet and this phone's sync takes that over. "Read again" (Claude misreads it the same way) must keep the fix, and
// nothing may write the misread back (v37: the read put "JOHN SMTIH" back, the card showed "Changed", and Update wrote
// it over the fix). Also: a re-read that finds no name ("NO NAME ON LABEL") never replaces a filled name.
const G = require('./lib_g4.js'), L = G.L;
const NAME = 'g4_sheet_fix_kept';
(async () => {
  L.LABELS.L1 = { customer: 'JOHN SMTIH', tracking: 'TBA111111111111', weight: '4' };   // Claude keeps misreading it
  L.LABELS.L4 = { customer: '', tracking: 'TBA444444444444', weight: '2' };             // this label shows no name
  const ctl = { start: 106 };
  const t = await G.begin(ctl);
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const f = G.G2.sentBox({ id: 'f', seq: 1, sheetRow: 107, photosLinked: true, row: { customer: 'JOHN SMTIH', tracking: 'TBA111111111111', weight: '4', contents: 'ALPHA SHOE (1 TOTAL)' } });
    const n = G.G2.sentBox({ id: 'n', seq: 2, sheetRow: 108, photosLinked: true, _shapes: ['L4', 'B'], row: { customer: 'ANNA LEE', tracking: 'TBA444444444444', weight: '2', contents: 'BRAVO SOCK (1 TOTAL)' } });
    ctl.sheet.set(107, G.sheetRow(G.today(), f.sentCells.slice(0, 7), [{ id: 'FLINKxxxxxxxxxxxxxxxxxxxxx', label: 'LABEL 1' }]));
    ctl.sheet.set(108, G.sheetRow(G.today(), n.sentCells.slice(0, 7), [{ id: 'NLINKxxxxxxxxxxxxxxxxxxxxx', label: 'LABEL 1' }]));
    await G.setLs(t, { autoSend: '0', nextRowSeen: '109' });
    await G.seed(t, [f, n]);
    ctl.sheet.get(107).cells[0] = 'JOHN SMITH';                // the office fixes the name in the sheet
    await t.ev('syncDay()'); await G.idle(t);
    if ((await G.box(t, 'f')).row.customer !== 'JOHN SMITH') fail('setup: the sync didn\'t take the fix');
    for (const id of ['f', 'n']) {
      await G.G2.expand(t, id);
      await t.page.click(`[data-id="${id}"] [data-act="reread"]`);
      await L.waitFor(t, `!S.active.size && !S.readQ.length`, 20000); await G.idle(t);
    }
    const a = await G.box(t, 'f'), b = await G.box(t, 'n');
    if (a.row.customer !== 'JOHN SMITH') fail('Read again put back ' + a.row.customer);
    if (b.row.customer !== 'ANNA LEE') fail('a read with no name replaced ANNA LEE with ' + b.row.customer);
    if (a.view === 'dirty' || b.view === 'dirty') { await t.ev('updateRows()'); await G.idle(t); }
    if (ctl.sheet.get(107).cells[0] !== 'JOHN SMITH') fail('the sheet\'s fix was overwritten: ' + ctl.sheet.get(107).cells[0]);
    if (ctl.sheet.get(108).cells[0] !== 'ANNA LEE') fail('row 108 now says ' + ctl.sheet.get(108).cells[0]);
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

// R10: a note typed on the card of a box already in the sheet is read with the box, but that read takes only Contents and
// flags. (A) Sent as JOHN SMTIH before the update, fixed to JOHN SMITH in the sheet and synced by v37 (nothing marked as
// edited); Claude still reads JOHN SMTIH: the name stays JOHN SMITH (before: the card went back to JOHN SMTIH, "Changed",
// and Update sheet row wrote it over the office's fix). (B) Claude reads the weight differently the second time: it stays.
// (C) A box that had a Read again before (its later reads stay careful): the same, and the read is still careful.
// Update sheet row then writes only the note's line. (E) Read again still reads every field.
const { G, G2, L, makeBackend5, typeField, view } = require('./lib_g5.js');
const NAME = 'r_R10_note_fields';
const PORT = +process.env.PORT || 10640;
(async () => {
  L.LABELS.L1 = { customer: 'JOHN SMTIH', tracking: 'TBA111111111111', weight: '4' };   // a misreading
  L.LABELS.L2 = { customer: 'MARY JONES', tracking: 'TBA222222222222', weight: '8' };   // the second reading of the weight
  L.LABELS.L3 = { customer: 'PETER PAM', tracking: 'TBA333333333333', weight: '9' };    // a misreading
  const ctl = { start: 106 };
  const t = await G.start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: makeBackend5(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const rowOf = id => t.ev(`JSON.stringify(S.boxes.get(${JSON.stringify(id)}).row)`).then(JSON.parse);
  try {
    await L.waitFor(t, 'PACE.ready || PACE.off', 15000); await G.idle(t);
    const old = { at: Date.now() - 3600e3, effort: 'medium', note: '', verify: { match: true, by: 'barcode' } };
    const mk = (id, seq, sheetRow, row, shapes, read) => G2.sentBox({ id, seq, sheetRow, photosLinked: true, row, _shapes: shapes, proof: [{ line: row.contents, photos: [id + 'p1'] }], read });
    const f = mk('f', 1, 107, { customer: 'JOHN SMITH', tracking: 'TBA111111111111', weight: '4', contents: 'ALPHA SHOE (1 TOTAL)' }, ['L1', 'A'], old);
    const b = mk('b', 2, 108, { customer: 'MARY JONES', tracking: 'TBA222222222222', weight: '7', contents: 'BRAVO SOCK (1 TOTAL)' }, ['L2', 'B'], old);
    const c = mk('c', 3, 109, { customer: 'PETER PAN', tracking: 'TBA333333333333', weight: '9', contents: 'CHARLIE LAMP (1 TOTAL)' }, ['L3', 'C'], Object.assign({}, old, { effort: 'high', careful: true }));
    for (const x of [f, b, c]) ctl.sheet.set(x.sheetRow, G.sheetRow(G.today(), x.sentCells.slice(0, 7), [{ id: 'LNK' + x.id + 'xxxxxxxxxxxxxxxxxxxxxxx', label: 'LABEL 1' }]));
    await G.setLs(t, { nextRowSeen: '110' });
    await G.seed(t, [f, b, c]);
    for (const [id, field, want] of [['f', 'customer', 'JOHN SMITH'], ['b', 'weight', '7'], ['c', 'customer', 'PETER PAN']]) {
      const n0 = ctl.log.length;
      await typeField(t, id, 'note', 'ALSO 2 PHONE CASE');
      await t.page.waitForTimeout(600); await G.idle(t);
      const r = await rowOf(id), v = await view(t, id);
      if (ctl.log.length === n0 || v.readNote !== 'ALSO 2 PHONE CASE') fail(`${id}: the note wasn't read`);
      if (r[field] !== want) fail(`${id}: ${field} is now ${JSON.stringify(r[field])}`);
      if (!/PHONE CASE \(2 TOTAL\)/.test(r.contents) || v.view !== 'dirty') fail(`${id}: not Changed with the note's line: ` + JSON.stringify(v));
    }
    if (!(await t.ev(`!!(S.boxes.get('c').read || {}).careful`))) fail('c: its read is no longer careful');
    const bar = (await t.page.textContent('#sendBtn')).trim();
    if (bar !== 'Update 3 changed rows') fail('bar: ' + bar);
    else { await t.page.click('#sendBtn'); await t.page.waitForTimeout(500); await G.idle(t); }
    const want = { 107: ['JOHN SMITH', '4', 'ALPHA SHOE (1 TOTAL) ///\nPHONE CASE (2 TOTAL)'], 108: ['MARY JONES', '7', 'BRAVO SOCK (1 TOTAL) ///\nPHONE CASE (2 TOTAL)'], 109: ['PETER PAN', '9', 'CHARLIE LAMP (1 TOTAL) ///\nPHONE CASE (2 TOTAL)'] };
    for (const [n, w] of Object.entries(want)) {
      const cl = ctl.sheet.get(+n).cells;
      if (cl[0] !== w[0] || cl[3] !== w[1] || cl[6] !== w[2]) fail(`row ${n}: ` + JSON.stringify(cl));
    }
    // (E) Read again reads every field, as before
    await G2.expand(t, 'f');
    await t.page.click('[data-id="f"] [data-act="reread"]');
    await t.page.waitForTimeout(500); await G.idle(t);
    if ((await rowOf('f')).customer !== 'JOHN SMTIH' || (await view(t, 'f')).view !== 'dirty') fail('Read again didn’t read the name: ' + JSON.stringify(await rowOf('f')));
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

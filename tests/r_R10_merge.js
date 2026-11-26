// R10 (how requests combine): a note's read of a box in the sheet takes only Contents and flags — but only while that is
// all that was asked for. Claude is held so the requests meet. (g) Read again tapped while the note's read runs: the read
// after it reads every field. (m) A photo added meanwhile (the queueRead that + Camera DONE, a photo arriving or the photo
// viewer make) while it runs: the same. (q) Read again tapped while the note's read waits behind another box: one read,
// of every field. (r) The note changed again while its read waits: still a note's read (the name stays as sent), with
// the newer note's line. Each misread name shows which kind of read it got.
const { G, G2, L, makeBackend5, typeField } = require('./lib_g5.js');
const NAME = 'r_R10_merge';
const PORT = +process.env.PORT || 10645;
(async () => {
  L.LABELS.L1 = { customer: 'JOHN SMTIH', tracking: 'TBA111111111111', weight: '4' };
  L.LABELS.L2 = { customer: 'MARY JONSE', tracking: 'TBA222222222222', weight: '7' };
  L.LABELS.L3 = { customer: 'PETER PAM', tracking: 'TBA333333333333', weight: '9' };
  L.LABELS.L4 = { customer: 'ANNA LEA', tracking: 'TBA444444444444', weight: '2' };
  const ctl = { start: 106 };
  const t = await G.start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: makeBackend5(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  let release = () => {};
  const hold = () => { ctl.gate = { claude: new Promise(r => { release = () => { ctl.gate = null; r(); }; }) }; };
  const row = id => t.ev(`JSON.stringify(S.boxes.get(${JSON.stringify(id)}).row)`).then(JSON.parse);
  try {
    await L.waitFor(t, 'PACE.ready || PACE.off', 15000); await G.idle(t);
    const old = { at: Date.now() - 3600e3, effort: 'medium', note: '', verify: { match: true, by: 'barcode' } };
    const mk = (id, seq, sheetRow, r, shapes) => G2.sentBox({ id, seq, sheetRow, photosLinked: true, row: Object.assign({ contents: 'ALPHA SHOE (1 TOTAL)' }, r), _shapes: shapes, proof: [], read: old });
    const boxes = [
      mk('g', 1, 107, { customer: 'JOHN SMITH', tracking: 'TBA111111111111', weight: '4' }, ['L1', 'A']),
      mk('m', 2, 108, { customer: 'MARY JONES', tracking: 'TBA222222222222', weight: '7' }, ['L2', 'B']),
      mk('q', 3, 109, { customer: 'PETER PAN', tracking: 'TBA333333333333', weight: '9' }, ['L3', 'C']),
      mk('r', 4, 110, { customer: 'ANNA LEE', tracking: 'TBA444444444444', weight: '2' }, ['L4', 'D']),
      mk('k', 5, 111, { customer: 'BOB KIM', tracking: 'TBA555555555555', weight: '3' }, ['E']),    // no label: holds the read slot
    ];
    for (const x of boxes) ctl.sheet.set(x.sheetRow, G.sheetRow(G.today(), x.sentCells.slice(0, 7), []));
    await G.setLs(t, { nextRowSeen: '112' });
    await G.seed(t, boxes);
    // (g) Read again during the note's read
    hold();
    await typeField(t, 'g', 'note', 'ALSO 2 PHONE CASE');
    await L.waitFor(t, `S.active.has('g')`, 10000);
    await t.page.click('[data-id="g"] [data-act="reread"]');
    release(); await t.page.waitForTimeout(300); await G.idle(t);
    if ((await row('g')).customer !== 'JOHN SMTIH') fail('(g) Read again during a note’s read didn’t read the name: ' + JSON.stringify(await row('g')));
    // (m) a photo change during the note's read
    hold();
    await typeField(t, 'm', 'note', 'ALSO 2 PHONE CASE');
    await L.waitFor(t, `S.active.has('m')`, 10000);
    await t.ev(`queueRead('m'), 1`);
    release(); await t.page.waitForTimeout(300); await G.idle(t);
    if ((await row('m')).customer !== 'MARY JONSE') fail('(m) a photo’s read during a note’s read was cut to Contents: ' + JSON.stringify(await row('m')));
    // (q) and (r): their reads wait behind box k's
    hold();
    await t.ev(`queueRead('k'), 1`);
    await L.waitFor(t, `S.active.has('k')`, 10000);
    await typeField(t, 'q', 'note', 'ALSO 2 PHONE CASE');
    await t.page.click('[data-id="q"] [data-act="reread"]');
    await typeField(t, 'r', 'note', 'FRAGILE');
    await typeField(t, 'r', 'note', 'ALSO 2 PHONE CASE');
    const waiting = await t.ev(`JSON.stringify(S.readQ.map(j => j.id))`);
    if (waiting !== '["q","r"]') fail('setup: waiting reads ' + waiting);
    release(); await t.page.waitForTimeout(300); await G.idle(t);
    const rq = await row('q'), rr = await row('r');
    if (rq.customer !== 'PETER PAM') fail('(q) Read again on a waiting note’s read didn’t read the name: ' + JSON.stringify(rq));
    if (rr.customer !== 'ANNA LEE' || !/PHONE CASE \(2 TOTAL\)/.test(rr.contents)) fail('(r) two notes: ' + JSON.stringify(rr));
    if (await t.ev(`(S.boxes.get('r').read || {}).note`) !== 'ALSO 2 PHONE CASE') fail('(r) read without the newer note');
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { release(); await t.close(); }
  L.report(NAME, ok, why);
})();

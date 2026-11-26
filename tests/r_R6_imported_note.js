// R6: another phone logged box TBA111…; Claude misread the name as JOHN SMTIH there and that phone's operator fixed it to
// JOHN SMITH by hand, so row 150 says JOHN SMITH. On this phone the row is an imported card. The operator opens it and
// types "ALSO 2 PHONE CASE" in its Note for Claude. The notice says the box isn't read again here and to type what the
// note adds into Contents (before: "tap Read again to read it with your note" — that read put JOHN SMTIH back, and Update
// sheet row wrote it over the other phone's fix). Nothing is read; doing what the notice says puts the phone cases in and
// keeps JOHN SMITH.
const { G, G2, L, makeBackend5, typeField, view } = require('./lib_g5.js');
const NAME = 'r_R6_imported_note';
const PORT = +process.env.PORT || 10620;
(async () => {
  L.LABELS.L1 = { customer: 'JOHN SMTIH', tracking: 'TBA111111111111', weight: '4' };   // what Claude reads off the label
  const ctl = { start: 149 };
  const t = await G.start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: makeBackend5(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const claudeN = () => ctl.ops.filter(o => o === 'claude').length;
  try {
    await L.waitFor(t, 'PACE.ready || PACE.off', 15000); await G.idle(t);
    const pics = [];
    for (const [i, s] of ['L1', 'A'].entries()) {
      const fid = `R6Tx${i}xxxxxxxxxxxxxxxxxxxxxxx`, lab = /^L/.test(s) ? 'LABEL 1' : `INSIDE ${i}`;
      ctl.drive.set(fid, { b64: (await L.jpeg(t.page, s)).toString('base64'), label: lab }); pics.push({ id: fid, label: lab });
    }
    ctl.sheet.set(150, G.sheetRow(G.today(), ['JOHN SMITH', 'TBA111111111111', '1', '4', 'AMAZON', 'NO INVOICE', 'ALPHA SHOE (1 TOTAL)'], pics));
    await t.ev('syncDay()'); await G.idle(t);
    const id = await t.ev(`(allBoxes().find(b => b.imported) || {}).id`);
    if (!id) throw new Error('setup: no imported card');
    await G2.expand(t, id);                                          // its photos load from Drive
    await L.waitFor(t, `S.boxes.get(${JSON.stringify(id)}).photos.length === 2 && !picsLoading.size`, 20000);
    await t.page.waitForTimeout(300);
    const c0 = claudeN();
    await typeField(t, id, 'note', 'ALSO 2 PHONE CASE');
    await t.page.waitForTimeout(1000); await G.idle(t);
    const n = await G.noticeText(t), bad = await t.ev('document.querySelector("#notice").classList.contains("bad")');
    if (!/^Box #\d+ is another phone’s box, so it isn’t read again — type what the note adds into Contents\./.test(n) || !bad) fail('notice: ' + JSON.stringify(n) + (bad ? '' : ' (not red)'));
    if (/Read again/.test(n)) fail('the notice still says Read again');
    if (claudeN() !== c0) fail(`${claudeN() - c0} Claude calls after the note`);
    let b = await view(t, id);
    if (b.view !== 'sent' || await t.ev(`S.boxes.get(${JSON.stringify(id)}).row.customer`) !== 'JOHN SMITH') fail('the card changed: ' + JSON.stringify(b));
    // what the notice says: the note's item typed into Contents, then Update sheet row
    await typeField(t, id, 'contents', 'ALPHA SHOE (1 TOTAL)\nPHONE CASE (2 TOTAL)');
    await t.page.waitForTimeout(300);
    if (await t.ev(`!!document.querySelector('[data-id="${id}"] [data-act="upd"]')`)) { await t.page.click(`[data-id="${id}"] [data-act="upd"]`); await t.page.waitForTimeout(500); await G.idle(t); }
    const row = ctl.sheet.get(150).cells;
    if (row[0] !== 'JOHN SMITH' || row[6] !== 'ALPHA SHOE (1 TOTAL) ///\nPHONE CASE (2 TOTAL)') fail('row 150: ' + JSON.stringify(row));
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

// R30: a Note for Claude typed on a box with no photos on this phone is never silently ignored. (a) An own box in the
// sheet 8 days ago whose photos were all in Drive, cleared by "Delete photos of boxes already in the sheet" (photos [],
// purged): the notice says its photos were cleared and to type what the note adds into Contents. (b) Another phone's box
// whose Drive photos haven't loaded yet (the note typed right after opening its card): the other-phone notice. (c) An own
// box in the sheet with no photos and no purge mark: the same "type what the note adds" notice. None is read. (Before:
// all three sat behind the photo-count check — no notice, no read, only a NOTE chip.)
const { G, G2, L, makeBackend5, typeField, view } = require('./lib_g5.js');
const NAME = 'r_R30_no_photos_note';
const PORT = +process.env.PORT || 10630;
(async () => {
  const ctl = { start: 99 };
  const t = await G.start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: makeBackend5(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const claudeN = () => ctl.ops.filter(o => o === 'claude').length;
  const said = async () => ({ text: await G.noticeText(t), bad: await t.ev('document.querySelector("#notice").classList.contains("bad")') });
  try {
    await L.waitFor(t, 'PACE.ready || PACE.off', 15000); await G.idle(t);
    // (a) own box: label + 3 inside photos, sent, photos saved to Drive, 8 days old, then the purge
    for (const s of ['L1', 'A', 'B', 'C']) await L.phonePhoto(t, s);
    await L.waitFor(t, '!S.sortP.size');
    const pa = await t.ev('S.current'), qa = JSON.stringify(pa);
    await t.page.click('#curFinish');
    await G.idle(t);
    await L.waitFor(t, `S.boxes.get(${qa}).sheetRow && S.boxes.get(${qa}).photosLinked`, 20000);
    await t.ev(`S.boxes.get(${qa}).createdAt = Date.now() - 8 * 86400000, 1`);
    await t.ev(`document.querySelector('#purgeBtn').click(), 1`);
    await L.waitFor(t, `S.boxes.get(${qa}).photos.length === 0 && !!S.boxes.get(${qa}).purged`, 10000);
    await G.idle(t);
    let c0 = claudeN();
    await typeField(t, pa, 'note', 'ALSO 2 PHONE CASE');
    await t.page.waitForTimeout(800); await G.idle(t);
    let s = await said();
    if (!/^Box #1: its photos were cleared from this phone, so it isn’t read again — type what the note adds into Contents\./.test(s.text) || !s.bad) fail('(a) notice: ' + JSON.stringify(s));
    if (claudeN() !== c0) fail(`(a) ${claudeN() - c0} Claude calls`);
    await t.ev('notice(null), 1');
    // (b) another phone's row with 2 Drive photos that take 4 s each to load: the note goes in before the first is here
    const pics = [];
    for (const [i, sh] of ['L2', 'D'].entries()) {
      const fid = `R30x${i}xxxxxxxxxxxxxxxxxxxxxxx`, lab = /^L/.test(sh) ? 'LABEL 1' : `INSIDE ${i}`;
      ctl.drive.set(fid, { b64: (await L.jpeg(t.page, sh)).toString('base64'), label: lab }); pics.push({ id: fid, label: lab });
    }
    ctl.sheet.set(150, G.sheetRow(G.today(), ['MARY JONES', 'TBA222222222222', '1', '7', 'AMAZON', 'NO INVOICE', 'DELTA MUG (1 TOTAL)'], pics));
    await t.ev('syncDay()'); await G.idle(t);
    const pb = await t.ev(`(allBoxes().find(b => b.imported) || {}).id`), qb = JSON.stringify(pb);
    if (!pb) throw new Error('setup: no imported card');
    ctl.delay.photoGet = 4000;
    c0 = claudeN();
    await typeField(t, pb, 'note', 'ALSO 2 PHONE CASE');               // expands the card (loading starts) and types at once
    if (await t.ev(`S.boxes.get(${qb}).photos.length`)) fail('(b) setup: its photos were already here');
    await t.page.waitForTimeout(300);
    s = await said();
    if (!/^Box #\d+ is another phone’s box, so it isn’t read again — type what the note adds into Contents\./.test(s.text) || !s.bad) fail('(b) notice: ' + JSON.stringify(s));
    await L.waitFor(t, `S.boxes.get(${qb}).photos.length === 2 && !picsLoading.size`, 30000).catch(() => fail('(b) its photos never loaded'));
    await G.idle(t);
    if (claudeN() !== c0) fail(`(b) ${claudeN() - c0} Claude calls`);
    ctl.delay.photoGet = 0;
    await t.ev('notice(null), 1');
    // (c) own box in the sheet with no photos and no purge mark
    const c = G2.sentBox({ id: 'np', seq: 2, sheetRow: 151, photos: [], photosLinked: true, row: { customer: 'PETER PAN', tracking: 'TBA333333333333', weight: '9', contents: 'CHARLIE LAMP (1 TOTAL)' } });
    ctl.sheet.set(151, G.sheetRow(G.today(), c.sentCells.slice(0, 7), []));
    await G2.inject(t, [], [c]); await G.reload(t);
    c0 = claudeN();
    await typeField(t, 'np', 'note', 'ALSO 2 PHONE CASE');
    await t.page.waitForTimeout(800); await G.idle(t);
    s = await said();
    if (!/^Box #2 has no photos on this phone, so it isn’t read again — type what the note adds into Contents\./.test(s.text) || !s.bad) fail('(c) notice: ' + JSON.stringify(s));
    if (claudeN() !== c0) fail(`(c) ${claudeN() - c0} Claude calls`);
    const v = await view(t, 'np');
    if (v.view !== 'sent' || v.note !== 'ALSO 2 PHONE CASE') fail('(c) card: ' + JSON.stringify(v));
    if (G.pageErrors(t).length) fail('page errors ' + JSON.stringify(G.pageErrors(t)));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

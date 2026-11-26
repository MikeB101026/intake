// F2: a photo added on this phone to another phone's box (an imported card). It must reach Drive together with the
// other phone's photos (AV–BJ is rewritten with exactly what is sent), the new Drive files must not be loaded again as
// duplicates, and when one of the other phone's photos can't be loaded nothing is sent (its links stay).
// (v37: the photo was never uploaded; imported cards are always marked "photos linked".)
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'g2_imported';
(async () => {
  const ctl = { photoGetFail: id => /^OTHER901x2/.test(id) };   // one Drive file of row 901 can't be loaded
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: G.makeBackend2(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    const pics900 = await G.otherRow(t, ctl, { row: 900, cells: ['ANNA LEE', 'TBA444444444444', '1', '2', 'AMAZON', 'NO INVOICE', 'ALPHA SHOE (1 TOTAL)'], shapes: ['L4', 'A'] });
    const pics901 = await G.otherRow(t, ctl, { row: 901, cells: ['PETER PAN', 'TBA333333333333', '1', '9', 'AMAZON', 'NO INVOICE', 'BRAVO SOCK (1 TOTAL)'], shapes: ['L3', 'B', 'C'] });
    await t.ev('syncDay().then(() => 1)');
    await L.waitFor(t, 'allBoxes().filter(b => b.imported).length === 2', 10000);
    const ids = await t.ev('JSON.stringify(Object.fromEntries(allBoxes().map(b => [b.sheetRow, b.id])))').then(JSON.parse);
    const a = ids[900], q = JSON.stringify(a);
    await G.expand(t, a);                              // its photos load from Drive
    await L.waitFor(t, `S.boxes.get(${q}).photos.length === 2 && !picsLoading.size`, 10000);
    await G.camOnCard(t, a, 1);
    await t.page.click('#camDone');
    await L.waitFor(t, 'document.querySelector("#cam").hidden', 10000);
    await t.page.waitForTimeout(500); await G.idle(t);
    const up = ctl.uploads.filter(u => u.row === 900).pop();
    if (!up || up.n !== 3 || !up.who.includes('L4') || !up.who.includes('A')) fail('row 900 after the new photo: ' + JSON.stringify(ctl.uploads.map(u => [u.row, u.who])));
    const gets = t.calls.filter(c => c.op === 'photoGet').length;
    await t.ev('syncDay().then(() => 1)'); await t.page.waitForTimeout(800); await G.idle(t);
    const b = await G.box(t, a), gets2 = t.calls.filter(c => c.op === 'photoGet').length;
    if (b.n !== 3 || gets2 !== gets) fail(`after the next sync: ${b.n} photos, ${gets2 - gets} downloads (its own new links loaded again?)`);
    if (!b.linked) fail('not marked saved ' + JSON.stringify(b));
    // row 901: a photo added while one of its Drive photos can't be loaded — nothing may be sent
    const c = ids[901], qc = JSON.stringify(c);
    const b64 = (await L.jpeg(t.page, 'D')).toString('base64');
    await t.ev(`(() => { const u = Uint8Array.from(atob(${JSON.stringify(b64)}), x => x.charCodeAt(0));
      const p = { id: 'add-d', t: Date.now(), blob: new Blob([u], { type: 'image/jpeg' }), w: 1000, h: 460, split: false, box: null, kind: 'item', src: 'camera' };
      S.photos.set(p.id, p); return putPhoto(p).then(() => attachToBox(${qc}, [p])).then(() => 1); })()`);
    await t.page.waitForTimeout(1000);
    await L.waitFor(t, `!!S.boxes.get(${qc}).linkError || S.boxes.get(${qc}).photosLinked`, 40000).catch(() => {});
    const row901 = ctl.sheet.rows.find(r => r.row === 901);
    if (ctl.uploads.some(u => u.row === 901) || JSON.stringify(row901.pics) !== JSON.stringify(pics901)) fail('row 901 was rewritten without the other phone’s photo: ' + JSON.stringify(row901.pics));
    const bc = await G.box(t, c);
    if (bc.linked) fail('row 901 box claims its photos are saved');
    // the app closed halfway through adding a photo to row 900's card: at start-up it goes back in, and to Drive with the rest
    // (a photo cut off while it was taken is never sorted yet: kind null — one with a kind waits to be sorted, R12)
    await G.inject(t, [{ id: 'stray-e', shape: 'E', kind: null, src: 'camera', box: a }], []);
    await G.reload(t);
    await L.waitFor(t, `S.boxes.get(${q}) && S.boxes.get(${q}).photos.includes('stray-e') && S.boxes.get(${q}).photosLinked`, 15000).catch(() => {});
    const u3 = ctl.uploads.filter(u => u.row === 900).pop();
    if (!u3 || u3.n !== 4 || !u3.who.includes('E') || !u3.who.includes('L4')) fail('stray photo of row 900 after start-up: ' + JSON.stringify(u3 && u3.who));
    if (t.errs.filter(e => !/Failed to load resource/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
    void pics900;
  } catch (e) { fail('exception ' + e.message); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

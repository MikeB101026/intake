// F2: "+ Camera" on a card that is already in the sheet (photos linked). The new shots must go to Drive with the box's
// other photos (one save at DONE, not one per shot), the card must say so, and a later purge may only delete photos
// that are in Drive. (v37: the shots were never uploaded, the card kept saying "photos linked in AV–BJ", and the
// purge deleted them.)
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'g2_cam_on_sent';
(async () => {
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: G.makeBackend2(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    await L.phonePhoto(t, 'L1'); await L.phonePhoto(t, 'A');
    await L.waitFor(t, '!S.sortP.size');
    const id = await t.ev('S.current');
    await t.page.click('#curFinish');
    await L.waitFor(t, `S.boxes.get(${JSON.stringify(id)}).photosLinked === true`, 20000);
    await G.idle(t);
    const row = (await G.box(t, id)).sheetRow;
    if (!row || ctl.uploads.length !== 1) throw new Error('setup: ' + JSON.stringify({ row, up: ctl.uploads }));
    await G.camOnCard(t, id, 2);                       // two more shots while the camera is open on the card
    await t.page.waitForTimeout(800);
    const during = ctl.uploads.length;
    await t.page.click('#camDone');
    await L.waitFor(t, 'document.querySelector("#cam").hidden', 10000);
    await t.page.waitForTimeout(500);
    await G.idle(t);
    const b = await G.box(t, id), last = ctl.uploads.filter(u => u.row === row).pop();
    if (during !== 1) fail(`uploads while the camera was still open: ${during - 1}`);
    if (!last || last.n !== 4 || !last.who.includes('L1') || !last.who.includes('A')) fail('the new shots did not go to Drive with the box: ' + JSON.stringify(ctl.uploads.map(u => u.who)));
    if (ctl.uploads.length !== 2) fail('expected one save at DONE, got uploads ' + JSON.stringify(ctl.uploads.map(u => u.n)));
    if (!b.linked || b.n !== 4) fail('box ' + JSON.stringify(b));
    await G.expand(t, id);
    const txt = await G.cardText(t, id);
    if (!/photos linked in AV–BJ/.test(txt)) fail('card: ' + txt.slice(-200));
    // A week later: Settings → Delete photos of boxes already in the sheet. Only photos that are in Drive may go.
    await t.ev(`(b => { b.createdAt = Date.now() - 8 * 86400000; return putBox(b).then(() => 1); })(S.boxes.get(${JSON.stringify(id)}))`);
    const before = await t.ev(`JSON.stringify(S.boxes.get(${JSON.stringify(id)}).photos)`).then(JSON.parse);
    await t.page.click('#gearBtn'); await t.page.click('#purgeBtn');
    await L.waitFor(t, '/Deleted/.test(document.querySelector("#storeInfo").textContent)', 10000);
    const left = await t.ev(`JSON.stringify(S.boxes.get(${JSON.stringify(id)}).photos)`).then(JSON.parse);
    const deleted = before.filter(pid => !left.includes(pid)).length, inDrive = last ? last.n : 0;
    if (deleted > inDrive) fail(`the purge deleted ${deleted} photos but only ${inDrive} are in Drive`);
    if (t.errs.length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

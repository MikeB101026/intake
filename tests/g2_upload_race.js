// linkPhotos takes its photos and row when it starts. (F2/F1) A photo that comes into the box while its photos are being
// saved must get a second save (v37 marked the box saved anyway: the photo never reached Drive). (F9) "Send as a new
// row" tapped while the old row's save is still running: the end of that save must not mark the box saved, so the new
// row gets the photos (v37: the new row got none, the card said "photos linked").
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'g2_upload_race';
(async () => {
  let release = null;
  const ctl = { photosHook: async (body, n) => { if (ctl.hold === n) await new Promise(r => { release = r; }); } };
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: G.makeBackend2(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    // 1) a photo comes in while the box's photos are being saved
    ctl.hold = 1;
    await L.phonePhoto(t, 'L1'); await L.phonePhoto(t, 'A');
    await L.waitFor(t, '!S.sortP.size');
    const id = await t.ev('S.current'), q = JSON.stringify(id);
    await t.page.click('#curFinish');
    await L.waitFor(t, `S.linking === ${q}`, 20000);
    await new Promise(r => { const w = () => release ? r() : setTimeout(w, 20); w(); });   // the save is on its way
    const b64 = (await L.jpeg(t.page, 'B')).toString('base64');
    await t.ev(`(() => { const u = Uint8Array.from(atob(${JSON.stringify(b64)}), c => c.charCodeAt(0));
      const p = { id: 'late-b', t: Date.now(), blob: new Blob([u], { type: 'image/jpeg' }), w: 1000, h: 420, split: false, box: null, kind: 'item', src: 'phone' };
      S.photos.set(p.id, p); return putPhoto(p).then(() => attachToBox(${q}, [p])).then(() => 1); })()`);   // as every caller saves a photo (v37 too)
    release(); release = null;
    await t.page.waitForTimeout(500);
    await G.idle(t);
    const b1 = await G.box(t, id), row1 = b1.sheetRow, last = ctl.uploads.filter(u => u.row === row1).pop();
    if (!last || !last.who.includes('B') || last.n !== 3) fail('the photo that came in during the save never went to Drive: ' + JSON.stringify(ctl.uploads.map(u => [u.row, u.who])));
    if (!b1.linked) fail('box not marked saved after its second save: ' + JSON.stringify(b1));
    // 2) "Send as a new row" while the old row's save is still running
    ctl.hold = ctl.photoCalls + 1;
    await L.phonePhoto(t, 'L2'); await L.phonePhoto(t, 'C');
    await L.waitFor(t, '!S.sortP.size');
    const id2 = await t.ev('S.current'), q2 = JSON.stringify(id2);
    await t.page.click('#curFinish');
    await L.waitFor(t, `S.linking === ${q2}`, 20000);
    await new Promise(r => { const w = () => release ? r() : setTimeout(w, 20); w(); });
    const rowA = (await G.box(t, id2)).sheetRow;
    await t.ev('syncBusy = true, 1');                                            // no 30-s sync in between (it would clear the flag)
    await t.ev(`patchBox(${q2}, x => { x.wrongRow = true; }).then(() => 1)`);   // the sync found it took an earlier day's row
    await G.expand(t, id2);
    await t.page.click(`[data-id="${id2}"] [data-act="resend"]`);
    await L.waitFor(t, '!document.querySelector("#plan").hidden', 10000);       // the tracking is in the sheet already
    await t.page.click('#planAll');                                              // Send all anyway: a new row
    await L.waitFor(t, `S.boxes.get(${q2}).sheetRow && S.boxes.get(${q2}).sheetRow !== ${rowA}`, 10000);
    const rowB = (await G.box(t, id2)).sheetRow;
    release(); release = null;                                                   // the old row's save ends only now
    await t.ev('syncBusy = false, 1');
    await t.page.waitForTimeout(500);
    await G.idle(t);
    const b2 = await G.box(t, id2), upB = ctl.uploads.filter(u => u.row === rowB).pop();
    if (!upB || upB.n !== 2) fail(`the new row ${rowB} got no photos: ` + JSON.stringify(ctl.uploads.map(u => [u.row, u.who])));
    if (!b2.linked || b2.sheetRow !== rowB) fail('box after resend ' + JSON.stringify(b2));
    if (t.errs.length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { if (release) release(); await t.close(); }
  L.report(NAME, ok, why);
})();

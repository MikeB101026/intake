// R25: boxes whose photos were saved to Drive by v37 (marked linked, no record of which photos went), 8 days old.
// Box "leg": its last PHONE CAMERA photo was still being stored on the phone when v37 took the box's photos for Drive,
// so AV–BJ links only 2 of its 3 — that photo's shot time is before the send, but it was stored after it (its id says
// when). Box "norm": an ordinary v37 box, all 3 photos stored before the send. Settings → "Delete photos of boxes
// already in the sheet" must keep all of "leg" (v38 deleted the third photo's only copy) and clear "norm".
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'r_R25_legacy_purge';
const PORT = +process.env.PORT || 10230;
(async () => {
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: G.makeBackend2(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    const day = G.daysAgo(8), shot = Date.now() - 8 * 86400000, sent = shot + 20000;
    const pid = (ms, k) => ms.toString(36) + 'abcde' + k;   // the app's photo ids: when the photo was stored, then a random part
    const L1 = pid(shot - 30000, 1), A1 = pid(shot - 20000, 2), B1 = pid(sent + 1500, 3);   // B1: stored 1.5 s after the send
    const N1 = pid(shot - 30000, 4), N2 = pid(shot - 20000, 5), N3 = pid(shot - 10000, 6);
    const leg = G.sentBox({ id: 'leg', day, seq: 1, sheetRow: 120, photos: [L1, A1, B1], createdAt: shot - 60000, sentAt: sent, photosLinked: true });
    const norm = G.sentBox({ id: 'norm', day, seq: 2, sheetRow: 121, photos: [N1, N2, N3], createdAt: shot - 60000, sentAt: sent, photosLinked: true, row: { customer: 'MARY JONES', tracking: 'TBA222222222222' } });
    await G.inject(t, [{ id: L1, shape: 'L1', kind: 'label', box: 'leg', t: shot - 30000 }, { id: A1, shape: 'A', kind: 'item', box: 'leg', t: shot - 20000 },
      { id: B1, shape: 'B', kind: 'item', box: 'leg', src: 'phone', t: shot },          // its shot time (EXIF): before Finish
      { id: N1, shape: 'L2', kind: 'label', box: 'norm', t: shot - 30000 }, { id: N2, shape: 'C', kind: 'item', box: 'norm', t: shot - 20000 },
      { id: N3, shape: 'D', kind: 'item', box: 'norm', t: shot - 10000 }], [leg, norm]);
    ctl.sheet.rows.push({ row: 120, day, cells: leg.sentCells.slice(0, 7), pics: [{ id: 'D1xxxxxxxxxxxxxxxxxxxxxx', label: 'LABEL 1' }, { id: 'D2xxxxxxxxxxxxxxxxxxxxxx', label: 'INSIDE 1' }] },
      { row: 121, day, cells: norm.sentCells.slice(0, 7), pics: [{ id: 'D3xxxxxxxxxxxxxxxxxxxxxx', label: 'LABEL 1' }, { id: 'D4xxxxxxxxxxxxxxxxxxxxxx', label: 'INSIDE 1' }, { id: 'D5xxxxxxxxxxxxxxxxxxxxxx', label: 'INSIDE 2' }] });
    await G.reload(t);
    await L.waitFor(t, 'S.boxes.size === 2', 10000); await t.page.waitForTimeout(800); await G.idle(t);
    await t.page.click('#gearBtn'); await t.page.click('#purgeBtn');
    await L.waitFor(t, '/Deleted/.test(document.querySelector("#storeInfo").textContent)', 10000);
    const info = await t.page.textContent('#storeInfo');
    const left = await t.ev(`JSON.stringify({ leg: S.boxes.get('leg').photos.filter(id => S.photos.has(id)).length, norm: S.boxes.get('norm').photos.filter(id => S.photos.has(id)).length })`).then(JSON.parse);
    if (left.leg !== 3) fail(`box leg: ${left.leg} of its 3 photos left on the phone (the one AV–BJ doesn't link was deleted)`);
    if (left.norm !== 0) fail(`box norm: ${left.norm} photos left (expected cleared)`);
    if (!/^Deleted 3 photos\. Kept 3 that aren’t saved to Drive\.$/.test(info.trim())) fail('message: ' + info);
    if (t.errs.filter(e => !/Failed to load resource/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

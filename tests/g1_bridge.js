// Android app bridge (window.__nativeShot / __nativeNextBox / __nativeDone):
//  F7: a photo whose file fails to load once or twice is read again and saved; one that never loads marks its box
//      ("didn't arrive", held on Check, never auto-sent), names the box and tells the app (AndroidIntake.shotFailed).
//  F8: a bridge photo still loading when the page's "Finish this box" is tapped goes into that box and its row.
//  F23: the camera's DONE waits while the note box is being typed in, so the whole note goes into the read.
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'g1_bridge';
(async () => {
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: L.makeBackend(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    const tries = {};
    await t.page.route('https://native.test/**', async route => {
      const name = new URL(route.request().url()).pathname.slice(1).replace(/\.jpg$/, ''), [shape, how] = name.split('-');
      tries[name] = (tries[name] || 0) + 1;
      const H = { 'Access-Control-Allow-Origin': '*' };
      if (how === 'gone' || (how === 'flaky' && tries[name] <= 2)) return route.fulfill({ status: 404, headers: H, body: 'no' });
      if (how === 'slow') await L.sleep(1200);
      route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'image/jpeg' }, H), body: await L.jpeg(t.page, shape) });
    });
    await t.page.evaluate(() => { window.__failed = []; window.AndroidIntake = { openCamera() {}, shotFailed(u) { window.__failed.push(u); } }; });
    const shot = name => t.page.evaluate(u => window.__nativeShot(u), `https://native.test/${name}.jpg`);
    await t.page.waitForTimeout(400);

    // F7 — box 1: label, a contents photo that loads on the 3rd try, one that never loads; then NEXT BOX in the camera.
    await shot('L3'); await shot('F-flaky'); await shot('G-gone');
    await t.page.evaluate(() => window.__nativeNextBox());
    await L.waitFor(t, '!S.current', 15000);
    await L.waitIdle(t);
    let bx = await L.boxes(t);
    const b1 = bx[0] || {};
    if (b1.n !== 2) fail(`box 1 should hold the label and the photo that loaded on a retry, has ${b1.n}`);
    if (b1.lostShots !== 1 || !b1.reasons.some(r => /didn’t arrive/.test(r))) fail('box 1 not marked for the lost photo: ' + JSON.stringify([b1.lostShots, b1.reasons]));
    if (ctl.sheet.rows.some(r => r.cells[0] === 'PETER PAN')) fail('box 1 was auto-sent although a photo never arrived');
    const failed = await t.page.evaluate(() => window.__failed);
    if (!failed.some(u => /G-gone/.test(u))) fail('AndroidIntake.shotFailed not called: ' + JSON.stringify(failed));
    const note1 = await t.page.textContent('#notice');
    if (!/Box #1/.test(note1)) fail('notice does not name the box: ' + JSON.stringify(note1));

    // F8 — box 2: label, then a photo still loading when the page's Finish is tapped.
    await shot('L4'); await L.waitFor(t, 'S.current && S.boxes.get(S.current).photos.length === 1', 10000);
    const n0 = await L.photoCount(t);
    await shot('H-slow');
    await t.page.click('#curFinish');
    await L.waitFor(t, `S.photos.size >= ${n0 + 1}`, 15000);
    await L.waitIdle(t);
    bx = await L.boxes(t);
    const row2 = ctl.sheet.rows.find(r => r.cells[0] === 'ANNA LEE');
    if (bx.length !== 2) fail('the late photo started a box of its own: ' + JSON.stringify(bx.map(b => [b.seq, b.n, b.customer])));
    if (!row2 || !/HOTEL CUP/.test(row2.cells[6])) fail('box 2 row missing the late photo: ' + JSON.stringify(row2 && row2.cells[6]));

    // F23 — box 3: the operator types a note while the camera's DONE waits in the queue.
    await shot('L1'); await L.waitFor(t, 'S.current && S.boxes.get(S.current).photos.length === 1', 10000);
    await t.page.click('#curNote'); await t.page.keyboard.type('ONLY 2 OF THE');
    await t.page.evaluate(() => window.__nativeDone());
    await t.page.waitForTimeout(800);                  // a pause in typing: DONE must still wait
    await t.page.keyboard.type(' 3 MUGS ARRIVED');
    await t.page.click('#listTitle');                  // leaves the note box
    await L.waitFor(t, '!S.current', 10000);
    await L.waitIdle(t);
    bx = await L.boxes(t);
    const b3 = bx.find(b => b.customer === 'JOHN SMITH') || {};
    if (b3.note !== 'ONLY 2 OF THE 3 MUGS ARRIVED' || b3.readNote !== 'ONLY 2 OF THE 3 MUGS ARRIVED') fail('note cut off: ' + JSON.stringify([b3.note, b3.readNote]));
    const errs = t.errs.filter(e => !/Failed to load resource/.test(e));   // the 404s above are on purpose
    if (errs.length) fail('page errors ' + JSON.stringify(errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

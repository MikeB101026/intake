// Smoke: the app loads with no page errors, and 3 QUICK CAM shots land in one box.
const { start } = require('./h.js');
(async () => {
  const t = await start();
  let ok = true;
  try {
    await t.page.waitForTimeout(800);
    await t.page.click('#camBtn'); await t.page.waitForTimeout(1500);
    for (let i = 0; i < 3; i++) { await t.page.click('#shutter'); await t.page.waitForTimeout(150); }
    await t.ev('CAM.queue'); await t.page.waitForTimeout(400);
    const boxes = JSON.parse(await t.ev("JSON.stringify(allBoxes().map(b => b.photos.length))"));
    if (boxes.length !== 1 || boxes[0] !== 3) { ok = false; console.log('FAIL boxes', boxes); }
    if (t.errs.length) { ok = false; console.log('FAIL errors', t.errs); }
  } finally { await t.close(); }
  console.log(ok ? 'PASS t00_smoke' : 'FAIL t00_smoke'); process.exit(ok ? 0 : 1);
})();

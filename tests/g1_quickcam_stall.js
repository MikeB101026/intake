// F13: QUICK CAM when the full-resolution still stalls. Each photo must be the picture at ITS tap (the item aimed at),
// not a frame copied 3 s or 6 s later when the lens is already on the next package (v37 saved the next package's
// picture into the old box). After a stall, later shots don't wait for the stuck camera.
// The camera is a canvas the test paints: RED = the old box's item, BLUE = the next package.
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'g1_quickcam_stall';
(async () => {
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: L.makeBackend({}) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    await t.page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d');
      window.__color = '#e00000'; let k = 0;
      setInterval(() => { g.fillStyle = window.__color; g.fillRect(0, 0, 640, 480); g.fillStyle = '#808080'; g.fillRect(k++ % 600, 0, 4, 4); }, 30);
      navigator.mediaDevices.getUserMedia = async () => c.captureStream(30);
      window.ImageCapture = class { constructor() {} takePhoto() { return new Promise(() => {}); } getPhotoCapabilities() { return Promise.resolve({}); } };   // the still never comes
    });
    await t.page.click('#camBtn');
    await L.waitFor(t, 'CAM.stream && document.querySelector("#video").videoWidth > 0 && document.querySelector("#camMsg").hidden', 10000);
    await t.page.waitForTimeout(300);
    await t.page.click('#shutter');                    // the old box's last item
    await t.page.waitForTimeout(400);
    await t.page.click('#shutter');                    // a second angle, 0.4 s later
    await t.page.waitForTimeout(300);
    await t.page.click('#newBoxBtn');                  // NEXT BOX, and the operator turns to the next package
    await t.page.evaluate(() => { window.__color = '#0000e0'; });
    const t0 = Date.now();
    await L.waitFor(t, 'allBoxes().length >= 1 && !S.current', 15000);
    const waited = Date.now() - t0;
    await t.page.click('#shutter');                    // the next package's label: no waiting on the stuck camera any more
    await L.waitFor(t, 'S.photos.size >= 3', 10000);
    const colors = await t.ev(`(async () => {
      const out = [];
      for (const b of allBoxes().sort((a, c) => a.seq - c.seq)) for (const id of b.photos) {
        const bm = await createImageBitmap(S.photos.get(id).blob), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
        const g = c.getContext('2d'); g.drawImage(bm, 0, 0); const d = g.getImageData(bm.width >> 1, bm.height >> 1, 1, 1).data;
        out.push(b.seq + ':' + (d[0] > 150 && d[2] < 100 ? 'RED' : d[2] > 150 && d[0] < 100 ? 'BLUE' : 'OTHER'));
      }
      return out.join(',');
    })()`);
    if (colors !== '1:RED,1:RED,2:BLUE') fail('photos (box:picture) ' + colors);
    if (waited > 4500) fail(`NEXT BOX waited ${waited} ms on the stuck camera`);
    if (t.errs.length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

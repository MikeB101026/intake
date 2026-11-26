// R21: QUICK CAM with full-quality stills on (Settings default). The camera's photos are told apart from preview frames
// by their shape: a still is 2000×1500 (4:3), a preview frame 2400×1350 (16:9, the 4K preview).
//  1) The first still takes 3.5 s (the camera setting up its first full-resolution photo), the rest 0.3 s. The first
//     shot falls back to the frame copied at its tap; every later shot must be a full still again (v38 stayed on
//     preview frames for the whole camera session after that one slow still).
//  2) Camera opened again, every still takes 3.5 s: after the second slow still in a row it stays on preview frames
//     (the camera is asked for 2 stills, not one per shot: each slow one freezes the preview on a phone).
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'r_R21_slow_still';
const PORT = +process.env.PORT || 10440;
(async () => {
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: L.makeBackend({}) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const shapes = () => t.ev(`JSON.stringify(allBoxes().sort((a, b) => a.seq - b.seq).map(b => b.photos.map(id => { const p = S.photos.get(id); return !p ? '?' : p.w === 2000 && p.h === 1500 ? 'STILL' : p.w * 9 === p.h * 16 ? 'frame' : p.w + 'x' + p.h; })))`).then(JSON.parse);
  const session = async (taps, gapAfterFirst, gap) => {
    await t.page.click('#camBtn');
    await L.waitFor(t, 'CAM.stream && document.querySelector("#video").videoWidth > 0 && document.querySelector("#camMsg").hidden', 15000);
    await t.page.waitForTimeout(300);
    const asked0 = await t.ev('window.__stills');
    for (let i = 0; i < taps; i++) { await t.page.click('#shutter'); await t.page.waitForTimeout(i === 0 ? gapAfterFirst : gap); }
    await t.page.click('#camDone');
    await L.waitFor(t, 'document.querySelector("#cam").hidden', 30000);
    await L.waitFor(t, '!(S.saving > 0) && !(S.ending > 0)', 30000);
    await t.page.waitForTimeout(800);
    return (await t.ev('window.__stills')) - asked0;
  };
  try {
    await t.page.waitForTimeout(600);
    if (!(await t.ev('S.sharp && "ImageCapture" in window'))) throw new Error('setup: full-quality stills off or no ImageCapture');
    await t.page.evaluate(() => {
      window.__stills = 0; window.__delays = [3500]; window.__chain = Promise.resolve();
      ImageCapture.prototype.takePhoto = function () {             // one at a time, as on a phone
        window.__stills++;
        const d = window.__slowAll ? 3500 : window.__delays.length ? window.__delays.shift() : 300;
        const p = window.__chain.then(() => new Promise(r => setTimeout(r, d))).then(() => {
          const c = document.createElement('canvas'); c.width = 2000; c.height = 1500; const g = c.getContext('2d'); g.fillStyle = '#3a6'; g.fillRect(0, 0, 2000, 1500);
          return new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
        });
        window.__chain = p.catch(() => {});
        return p;
      };
    });
    // 1) one slow first still
    const asked1 = await session(5, 4500, 900);          // the next tap once the slow still is in (3.5 s)
    const s1 = (await shapes())[0] || [];
    if (s1.length !== 5) throw new Error('session 1 saved ' + JSON.stringify(s1));
    if (s1[0] !== 'frame') fail('the slow shot itself: ' + s1[0] + ' (expected the frame from its tap)');
    if (s1.slice(1).some(x => x !== 'STILL')) fail(`after one slow still the shots were ${JSON.stringify(s1)} (expected full stills again), ${asked1} stills asked`);
    // 2) every still slow
    await t.page.evaluate(() => { window.__slowAll = true; });
    const asked2 = await session(4, 4500, 4000);
    const s2 = (await shapes())[1] || [];
    if (s2.length !== 4 || s2.some(x => x !== 'frame')) fail('every still slow: shots ' + JSON.stringify(s2));
    if (asked2 !== 2) fail(`every still slow: the camera was asked for ${asked2} stills (expected 2: preview frames after two slow ones in a row)`);
    if (t.errs.filter(e => !/Failed to load resource/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

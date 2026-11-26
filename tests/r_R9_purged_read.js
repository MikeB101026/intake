// R9: a box in the sheet 8 days ago (label + 3 contents photos), whose photos Settings → "Delete photos of boxes already
// in the sheet" cleared from this phone. The operator adds one photo with + Camera on its card and taps Close (X), then
// again with DONE, then a photo comes in through attachToBox (a shot tapped just after Close), then the photo viewer
// moves a photo onto it. Each time: no read of what is left on the phone (v38 read the new photo alone, the contents
// dropped to that one line, and the bar offered "Update 1 changed row" that wrote it over column G); the card stays
// "In sheet" with its 3 lines, and a notice says to type what the photo adds. A box not purged is still read.
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'r_R9_purged_read';
const PORT = +process.env.PORT || 10400;
(async () => {
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: L.makeBackend(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const MSG = /older photos were cleared from this phone, so it isn’t read again — type what the new photo adds into Contents\./;
  try {
    await t.page.waitForTimeout(500);
    await L.phonePhoto(t, 'L1'); await L.phonePhoto(t, 'A'); await L.phonePhoto(t, 'B'); await L.phonePhoto(t, 'C');
    await L.waitFor(t, '!S.sortP.size');
    const id = await t.ev('S.current'), q = JSON.stringify(id);
    await t.page.click('#curFinish');
    await L.waitIdle(t);
    await L.waitFor(t, `S.boxes.get(${q}).sheetRow && S.boxes.get(${q}).photosLinked`, 20000);
    const lines = 'ALPHA SHOE (1 TOTAL) ///\nBRAVO SOCK (1 TOTAL) ///\nCHARLIE LAMP (1 TOTAL)';
    if (ctl.sheet.rows[0].cells[6] !== lines) throw new Error('setup: sheet contents ' + JSON.stringify(ctl.sheet.rows[0].cells[6]));
    await t.ev(`S.boxes.get(${q}).createdAt = Date.now() - 8 * 86400000, 1`);
    await t.ev(`document.querySelector('#purgeBtn').click(), 1`);
    await L.waitFor(t, `S.boxes.get(${q}).photos.length === 0 && !!S.boxes.get(${q}).purged`, 10000);
    const state = () => t.ev(`JSON.stringify({ view: viewStatus(S.boxes.get(${q})), contents: S.boxes.get(${q}).row.contents, n: S.boxes.get(${q}).photos.length,
      bar: document.querySelector('#sendBtn').textContent, notice: document.querySelector('#notice').hidden ? '' : document.querySelector('#notice').textContent })`).then(JSON.parse);
    const check = async (step, n) => {
      await L.waitIdle(t); await t.page.waitForTimeout(800); await L.waitIdle(t);
      const s = await state();
      if (s.n !== n) fail(`${step}: ${s.n} photos on the card (expected ${n})`);
      if (s.view !== 'sent' || s.contents !== lines) fail(`${step}: card ${s.view}, contents ${JSON.stringify(s.contents)}`);
      if (/Update/.test(s.bar)) fail(`${step}: bar offers ${JSON.stringify(s.bar)}`);
      if (!MSG.test(s.notice)) fail(`${step}: notice ${JSON.stringify(s.notice)}`);
      if (ctl.sheet.rows[0].cells[6] !== lines) fail(`${step}: sheet contents now ${JSON.stringify(ctl.sheet.rows[0].cells[6])}`);
      await t.ev('notice(null), 1');
    };
    const camShot = async () => {
      if (!(await t.ev(`S.expanded.has(${q})`))) await t.page.click(`[data-id="${id}"] [data-act="toggle"]`);
      const n0 = await t.ev(`S.boxes.get(${q}).photos.length`);
      await t.page.click(`[data-id="${id}"] [data-act="cam"]`);
      await L.waitFor(t, 'CAM.stream && document.querySelector("#video").videoWidth > 0 && document.querySelector("#camMsg").hidden', 10000);
      await t.page.click('#shutter');
      await L.waitFor(t, `S.boxes.get(${q}).photos.length === ${n0 + 1}`, 10000);
    };
    // 1) + Camera, one shot, Close
    await camShot(); await t.page.click('#camClose');
    await L.waitFor(t, 'document.querySelector("#cam").hidden', 10000);
    await check('+ Camera → Close', 1);
    // 2) + Camera, one shot, DONE
    await camShot(); await t.page.click('#camDone');
    await L.waitFor(t, 'document.querySelector("#cam").hidden', 10000);
    await check('+ Camera → DONE', 2);
    // 3) a photo that reaches the card after the camera closed (attachToBox's own read)
    const b64 = (await L.jpeg(t.page, 'D')).toString('base64');
    const addTo = (box, pid) => t.ev(`(() => { const u = Uint8Array.from(atob(${JSON.stringify(b64)}), x => x.charCodeAt(0));
      const p = { id: ${JSON.stringify(pid)}, t: Date.now(), blob: new Blob([u], { type: 'image/jpeg' }), w: 1000, h: 460, split: false, box: null, kind: null, src: 'camera' };
      return attachToBox(${JSON.stringify(box)}, [p]).then(() => 1); })()`);
    await addTo(id, 'late-d');
    await check('photo attached after Close', 3);
    // 4) the photo viewer moves a photo of another box onto it (the move list was made before it went into the sheet)
    await L.phonePhoto(t, 'E');
    const other = await t.ev('S.current'), pe = await t.ev(`S.boxes.get(${JSON.stringify(other)}).photos[0]`);
    await L.waitFor(t, '!S.sortP.size');
    await t.ev(`openLb(${JSON.stringify(pe)}), 1`);
    await t.ev(`(document.querySelector('#lbMove').innerHTML += '<option value="${id}">#1</option>', document.querySelector('#lbMove').value = ${q}, 1)`);
    await t.page.click('#lbMoveBtn');
    await L.waitFor(t, `S.boxes.get(${q}).photos.length === 4`, 10000);
    await check('photo moved onto it in the viewer', 4);
    // control: a box in the sheet that was NOT purged still reads the photo that comes in
    await L.phonePhoto(t, 'L2'); await L.phonePhoto(t, 'F');
    await L.waitFor(t, '!S.sortP.size');
    const id2 = await t.ev('S.current'), q2 = JSON.stringify(id2);
    await t.page.click('#curFinish');
    await L.waitIdle(t);
    await L.waitFor(t, `S.boxes.get(${q2}).sheetRow && S.boxes.get(${q2}).photosLinked`, 20000);
    await addTo(id2, 'late-g');
    await L.waitIdle(t); await t.page.waitForTimeout(800); await L.waitIdle(t);
    const c2 = await t.ev(`S.boxes.get(${q2}).row.contents`);
    if (!/DELTA MUG/.test(c2) || !/FOXTROT HAT/.test(c2)) fail('box not purged: the new photo wasn’t read with it: ' + JSON.stringify(c2));
    if (t.errs.filter(e => !/Failed to load resource/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();

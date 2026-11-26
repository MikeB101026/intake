// F4 backstops: a photo is never in two boxes.
//  1) SORT INTO BOXES & READ: a waiting photo that gets its box while the sort runs stays in that box only
//     (v37 put it into the sorted box as well).
//  2) Deleting a box keeps every photo another box also lists, and that photo now points at its box
//     (v37 deleted it from the phone, under the other box).
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'g1_shared_photos';
(async () => {
  let release; const hold = new Promise(r => { release = r; });
  const ctl = { hook: async kind => { if (kind === 'classify') await hold; } };
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: L.makeBackend(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    for (const [id, shape] of [['wait-1', 'A'], ['wait-2', 'B']]) {      // two photos waiting to be sorted
      const b64 = (await L.jpeg(t.page, shape)).toString('base64');
      await t.ev(`(() => { const u = Uint8Array.from(atob(${JSON.stringify(b64)}), c => c.charCodeAt(0));
        const p = { id: ${JSON.stringify(id)}, t: Date.now(), blob: new Blob([u], { type: 'image/jpeg' }), w: 1000, h: ${Math.round(1000 * L.SHAPES[shape])}, split: false, box: null, kind: null, src: 'camera' };
        return putPhoto(p).then(() => { S.photos.set(p.id, p); render(); return 1; }); })()`);
    }
    await L.waitFor(t, '!document.querySelector("#pending").hidden', 5000);
    await t.page.click('#pendSort');
    await t.page.waitForTimeout(400);                   // the sort call is on its way
    await t.ev(`currentBox().then(id => attachToBox(id, [S.photos.get('wait-1')])).then(() => 1)`);   // meanwhile wait-1 gets a box
    release();
    await L.waitIdle(t, 20000);
    const holders = await t.ev(`JSON.stringify(['wait-1', 'wait-2'].map(pid => allBoxes().filter(b => b.photos.includes(pid)).map(b => b.seq)))`).then(JSON.parse);
    if (holders[0].length !== 1) fail('wait-1 is in boxes ' + JSON.stringify(holders[0]));
    if (holders[1].length !== 1) fail('wait-2 is in boxes ' + JSON.stringify(holders[1]));
    // 2) a photo listed by two boxes (left by v37 on a phone): deleting one box keeps it for the other
    const [keep, gone] = await t.ev(`JSON.stringify([S.current, allBoxes().find(b => b.photos.includes('wait-2')).id])`).then(JSON.parse);
    await t.ev(`(() => { const b = S.boxes.get(${JSON.stringify(keep)}); b.photos.push('wait-2'); return putBox(b).then(() => 1); })()`);
    await t.ev(`deleteBox(${JSON.stringify(gone)}).then(() => 1)`);
    const left = await t.ev(`JSON.stringify({ mem: S.photos.has('wait-2'), box: (S.photos.get('wait-2') || {}).box })`).then(JSON.parse);
    const stored = await t.page.evaluate(async () => {
      const d = await new Promise((res, rej) => { const r = indexedDB.open('intake'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const p = await new Promise(res => { const q = d.transaction('photos', 'readonly').objectStore('photos').get('wait-2'); q.onsuccess = () => res(q.result); });
      d.close(); return p ? p.box : null;
    });
    if (!left.mem || stored == null) fail('the photo the other box lists was deleted');
    else if (left.box !== keep || stored !== keep) fail('the kept photo does not point at its box: ' + JSON.stringify([left.box, stored]));
    if (t.errs.length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { release(); await t.close(); }
  L.report(NAME, ok, why);
})();

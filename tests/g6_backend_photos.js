// F3 (backend): a box with more than 15 photos has every photo in the Drive photo folder: AV–BJ links the first 15 as
// before (labels first, as the app sends them), the rest go to the same folder with the names the app gives, and the
// reply says how many are saved. A box of 15 or fewer is saved exactly as before; a row that no longer holds the box
// gets nothing. (v9: photos past the 15 were dropped.) Runs backend/Code.gs in node.
const G6 = require('./lib_g6.js');
const NAME = 'g6_backend_photos';
let ok = true, why = '';
const fail = m => { ok = false; why += m + '; '; };
try {
  const day = G6.today();
  const be = G6.loadBackend({ props: { NEXT_ROW: '103' } });
  const sh = be.sh, folder = '1LVsQwAzpHMGiKzrJL0Cw1Q-l9LkalZ-w';
  G6.sepRow(sh, 100, day);
  G6.boxRow(sh, 101, day, ['JOHN SMITH', 'TBA111111111111', '1', '4', 'AMAZON', 'NO INVOICE', 'MANY THINGS']);
  G6.boxRow(sh, 102, day, ['MARY JONES', 'TBA222222222222', '1', '7', 'AMAZON', 'NO INVOICE', 'FEW THINGS']);
  const photo = (label, i) => ({ label, name: `${day} box 1 JOHN SMITH ${label}.jpg`, b64: Buffer.from(`photo ${i} ${label}`).toString('base64') });
  const labels = ['LABEL 1', 'LABEL 2', ...Array.from({ length: 15 }, (_, i) => `INSIDE ${i + 1}`)];
  const r = be.call({ op: 'photos', row: 101, expectTracking: 'TBA111111111111', photos: labels.map(photo) });
  if (r.error) throw new Error(r.error);
  const inFolder = [...be.drive.files.values()].filter(f => f.folder === folder);
  if (inFolder.length !== 17) fail(`17 photos sent, ${inFolder.length} in the Drive folder`);
  const names = inFolder.map(f => f.name);
  if (!labels.every(l => names.includes(`${day} box 1 JOHN SMITH ${l}.jpg`))) fail('files not named as sent: ' + names.slice(-3).join(', '));
  if (r.saved !== 17) fail('reply saved = ' + r.saved);
  if (!r.links || r.links.length !== 15 || r.links.map(l => l.label).join() !== labels.slice(0, 15).join()) fail('links: ' + JSON.stringify((r.links || []).map(l => l.label)));
  if (!r.more || r.more.length !== 2 || r.more.map(l => l.label).join() !== 'INSIDE 14,INSIDE 15') fail('more: ' + JSON.stringify(r.more));
  const av = sh.getRange(101, 48, 1, 16).getFormulas()[0];
  if (av.slice(0, 15).some(f => !/^=HYPERLINK\("https:\/\/drive\.google\.com\/file\/d\//.test(f)) || av[15]) fail('AV–BJ: ' + JSON.stringify(av.map(f => f.slice(-12))));
  if (!av[14].endsWith('"INSIDE 13")')) fail('BJ holds ' + av[14]);
  // The file of photo 17 is a real intake photo: photoGet hands it over.
  const m = String((r.more || [])[1] && r.more[1].url).match(/\/d\/([\w-]{20,})/);
  const g = m ? be.call({ op: 'photoGet', id: m[1] }) : { error: 'no id' };
  if (g.error || Buffer.from(g.b64, 'base64').toString() !== 'photo 16 INSIDE 15') fail('photoGet of photo 17: ' + JSON.stringify(g).slice(0, 80));
  // The day's rows still list the 15 linked photos for other phones.
  const d = be.call({ op: 'dayRows', day });
  const row = (d.rows || []).find(x => x.row === 101);
  if (!row || row.pics.length !== 15) fail('dayRows pics: ' + (row && row.pics.length));
  // 10 photos: exactly as before.
  const n0 = be.drive.files.size;
  const r10 = be.call({ op: 'photos', row: 102, expectTracking: 'TBA222222222222', photos: labels.slice(0, 10).map(photo) });
  if (r10.error || r10.links.length !== 10 || be.drive.files.size - n0 !== 10 || r10.saved !== 10 || (r10.more || []).length) fail('10 photos: ' + JSON.stringify({ links: r10.links && r10.links.length, made: be.drive.files.size - n0, saved: r10.saved }));
  const av2 = sh.getRange(102, 48, 1, 15).getFormulas()[0];
  if (av2.filter(Boolean).length !== 10) fail('AV–BJ of 10 photos: ' + av2.filter(Boolean).length);
  // A row that no longer holds the box: nothing saved.
  const n1 = be.drive.files.size;
  const bad = be.call({ op: 'photos', row: 102, expectTracking: 'TBA111111111111', photos: labels.map(photo) });
  if (!bad.error || be.drive.files.size !== n1) fail('wrong row: ' + JSON.stringify(bad).slice(0, 100));
} catch (e) { fail('exception ' + (e.stack || e.message)); }
G6.report(NAME, ok, why);

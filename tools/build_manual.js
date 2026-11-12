// 由 tools/manual_tpl.html 產生 manual.html：node tools/build_manual.js . tools/manual_tpl.html [年份]
const fs = require('fs'), path = require('path');
const dir = process.argv[2], tplPath = process.argv[3], Y = +(process.argv[4] || 2026);
global.window = {};
new Function(fs.readFileSync(path.join(dir, 'astro.js'), 'utf8'))();
new Function(fs.readFileSync(path.join(dir, 'data.js'), 'utf8'))();
const SM = window.SM, AS = window.AS;
const e = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// 每個月最暗的一晚（無月暗夜最長）
const best = [];
for (let m = 1; m <= 12; m++){
  let b = null;
  for (let d = 1; d <= AS.daysIn(Y, m); d++){ const n = AS.night(Y, m, d); if (!b || n.darkH > b.darkH) b = n; }
  best.push(b);
}
const nights = best.map(n => '<tr><td>' + n.m + '/' + n.d + '</td><td>' + n.phase + '</td><td>' + n.darkH.toFixed(1) + ' 小時</td><td>' + (n.gcH > 0 ? n.gcH.toFixed(1) + ' 小時（' + AS.hm(n.gcFrom) + '～' + AS.hm(n.gcTo) + '）' : '—') + '</td></tr>').join('\n');
const mhead = best.map(n => '<th>' + n.m + '/' + n.d + '</th>').join('');
const table = SM.SPOTS.map(p => '<tr><td>' + e(p.name) + '</td>' + best.map(n => { const r = SM.score(p, Y, n.m, n.d); return '<td class="sc" style="background:' + SM.SCORES[r.score].c + '" title="' + SM.SCORES[r.score].name + '">' + r.score + '</td>'; }).join('') + '</tr>').join('\n');
const spots = SM.REGIONS.map(r => r.name + '：' + SM.SPOTS.filter(s => s.r === r.id).map(s => s.name + '（' + s.city.replace(/（.*）/, '') + '，海拔約 ' + s.elev.toLocaleString() + ' 公尺，光害' + SM.LP[s.lp].name + '）').join('、')).join('</li><li>');
const certs = SM.SPOTS.filter(p => p.cert).map(p => '<li><b>' + e(p.name) + '</b>：' + e(p.cert) + '</li>').join('\n');
const scores = [5, 4, 3, 2, 1].map(s => '<tr><td><span class="k" style="background:' + SM.SCORES[s].c + '"></span> ' + s + '　' + SM.SCORES[s].name + '</td><td>' + e(SM.SCORES[s].tip) + '</td></tr>').join('\n');
const showers = SM.SHOWERS.map(s => '<tr><td>' + e(s.name) + '</td><td>' + s.m + '/' + s.d + '</td><td>' + s.zhr + '</td><td>' + e(s.tip) + '</td></tr>').join('\n');
let out = fs.readFileSync(tplPath, 'utf8').replace('{{NIGHTS}}', nights).replace('{{MHEAD}}', mhead).replace('{{TABLE}}', table).replace('{{SPOTS}}', spots)
  .replace('{{CERTS}}', certs).replace('{{SCORES}}', scores).replace('{{SHOWERS}}', showers).replace(/\{\{Y\}\}/g, Y).replace(/\{\{NS\}\}/g, SM.SPOTS.length);
fs.writeFileSync(path.join(dir, 'manual.html'), out);
console.log('manual ok', SM.SPOTS.length);

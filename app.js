/* ================= 台灣觀星地圖：介面 ================= */
(function(){
'use strict';
var $ = function(id){ return document.getElementById(id); };
var PREF_KEY = 'taiwanStarPrefs', SET_KEY = 'taiwanStarSettings', SEEN_KEY = 'taiwanStarSeenWarning', SEC_KEY = 'taiwanStarSetOpen';
var WD = ['日', '一', '二', '三', '四', '五', '六'];

function lsGet(k, d){ try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e){ return d; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e){} }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]; }); }
/* 台灣時間的「今晚」：清晨 6 點以前算前一晚 */
function tonight(){ var t = new Date(Date.now() + 8 * 3600000 - 6 * 3600000); return {y:t.getUTCFullYear(), m:t.getUTCMonth() + 1, d:t.getUTCDate()}; }
function wday(y, m, d){ return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; }
function fmtH(h){ return h < .05 ? '0' : h.toFixed(1); }

var set = Object.assign({date:'today', labels:true, layer:true, motion:'auto', theme:'auto', play:900, red:false, sky:true}, lsGet(SET_KEY, {}));
var pref = lsGet(PREF_KEY, {});
var t0 = tonight();
var st = {y:t0.y, m:t0.m, d:t0.d, region:SM.regionById[pref.region] ? pref.region : 'all', spot:SM.spotById[pref.spot] ? pref.spot : null, layer:set.layer !== false};
if (set.date === 'last' && pref.y){ st.y = pref.y; st.m = pref.m; st.d = pref.d; }
/* 分享連結：#d=2026-08-12&s=yuanfeng（日期與觀星點），優先於記住的設定 */
function readHash(){
  var h = {}; location.hash.replace(/^#/, '').split('&').forEach(function(kv){ var i = kv.indexOf('='); if (i > 0) h[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
  var ok = false, q = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(h.d || '');
  if (q && +q[1] >= 2000 && +q[1] <= 2099 && +q[2] >= 1 && +q[2] <= 12 && +q[3] >= 1 && +q[3] <= AS.daysIn(+q[1], +q[2])){ st.y = +q[1]; st.m = +q[2]; st.d = +q[3]; ok = true; }
  if (h.s && SM.spotById[h.s]){ st.spot = h.s; ok = true; } else if (q && !h.s){ st.spot = null; }
  return ok;
}
function hashStr(){ return '#d=' + st.y + '-' + ('0' + st.m).slice(-2) + '-' + ('0' + st.d).slice(-2) + (st.spot ? '&s=' + st.spot : ''); }
function shareUrl(){ return location.href.replace(/#.*$/, '') + hashStr(); }
readHash();
if (st.spot) st.region = SM.spotById[st.spot].r;
function save(){
  lsSet(PREF_KEY, {y:st.y, m:st.m, d:st.d, region:st.region, spot:st.spot});
  if (location.hash !== hashStr()){ try { history.replaceState(null, '', hashStr()); } catch (e){} }
}
function applyRed(){ document.documentElement.classList.toggle('redlight', !!set.red); var b = $('btnRed'); if (b){ b.classList.toggle('on', !!set.red); b.setAttribute('aria-pressed', set.red ? 'true' : 'false'); } }
/* 雲量預報：Open-Meteo（免金鑰、CORS 開放），15 個觀星點一次查，含前一天到未來 7 天逐小時雲量與氣溫；快取在本機 1 小時 */
var FC_KEY = 'taiwanStarForecast', FC_TTL = 3600000, fcData = null, fcState = 'loading';
function fcApply(data){
  fcData = data;
  SM.fcNight = function(p, n){
    var s = data.spots[p.id]; if (!s) return null;
    var from = n.darkH >= 1 ? n.darkFrom : (n.dusk || n.t0 + 6.5 * 3600000), to = n.darkH >= 1 ? n.darkTo : (n.dawn || n.t0 + 17.5 * 3600000);
    var i0 = Math.ceil((from - s.t0) / 3600000), i1 = Math.floor((to - s.t0) / 3600000), need = Math.max(1, i1 - i0 + 1), sum = 0, cnt = 0, tmin = null;
    for (var i = i0; i <= i1; i++){
      if (i < 0 || i >= s.c.length || s.c[i] == null) continue;
      sum += s.c[i]; cnt++;
      if (s.t[i] != null && (tmin === null || s.t[i] < tmin)) tmin = s.t[i];
    }
    if (!cnt || cnt < need * .6) return null;
    return {cloud:sum / cnt, tmin:tmin, src:s};
  };
}
function fcFetch(){
  var sp = SM.SPOTS, ctl = window.AbortController ? new AbortController() : null;
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + sp.map(function(p){ return p.at[1].toFixed(3); }).join(',') +
    '&longitude=' + sp.map(function(p){ return p.at[0].toFixed(3); }).join(',') + '&elevation=' + sp.map(function(p){ return p.elev; }).join(',') +
    '&hourly=cloud_cover,temperature_2m&timezone=Asia%2FTaipei&past_days=1&forecast_days=8';
  var tm = setTimeout(function(){ if (ctl) ctl.abort(); }, 15000);
  fetch(url, ctl ? {signal:ctl.signal} : {}).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function(arr){
    clearTimeout(tm);
    if (!Array.isArray(arr)) arr = [arr];
    var spots = {};
    arr.forEach(function(x, k){
      var t = x.hourly.time[0].split(/[-T:]/).map(Number);
      spots[sp[k].id] = {t0:Date.UTC(t[0], t[1] - 1, t[2], t[3]) - 8 * 3600000, c:x.hourly.cloud_cover, t:x.hourly.temperature_2m};
    });
    var data = {at:Date.now(), spots:spots};
    lsSet(FC_KEY, data); fcApply(data); fcState = 'ok'; render();
  }).catch(function(e){ clearTimeout(tm); console.warn('雲量預報讀取失敗', e); if (!fcData){ fcState = 'fail'; render(); } });
}
(function(){
  var c = lsGet(FC_KEY, null);
  if (c && c.spots && Date.now() - c.at < 6 * FC_TTL){ fcApply(c); fcState = 'ok'; }
})();
function fcStale(){ return !fcData || Date.now() - fcData.at > FC_TTL; }
function fcUpdated(){ return fcData ? AS.hm(fcData.at) : ''; }
var toastT = 0;
function toast(msg){ var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove('show'); }, 2600); }
function reduceOn(){ return set.motion === 'reduce' || (set.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function applyTheme(){ if (set.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', set.theme); }
applyTheme(); applyRed();

function scoreChip(s, extra){ var x = SM.SCORES[s]; return '<span class="schip s' + s + '" title="' + esc(x.tip) + '">' + '★★★★★'.slice(0, s) + '<em>' + '★★★★★'.slice(s) + '</em> ' + x.name + (extra || '') + '</span>'; }
function lpChip(lp){ var L = SM.LP[lp]; return '<span class="lpchip" style="--c:' + L.c + '" title="' + esc(L.tip) + '（本工具估計）">光害：' + L.name + '</span>'; }
function wxChips(wx){ return wx.map(function(k){ var w = SM.WXTYPES[k]; return '<span class="wx" title="' + esc(w.tip) + '">' + w.icon + ' ' + w.name + '</span>'; }).join(''); }
function hlNow(p, m){ return p.hl.filter(function(h){ return h.months[m]; }); }
function spotsInScope(){ return SM.SPOTS.filter(function(p){ return st.region === 'all' || p.r === st.region; }); }
function certShort(p){ return !p.cert ? '' : /暗空公園/.test(p.cert.slice(0, 30)) ? '國際暗空公園' : /暗空勝地/.test(p.cert.slice(0, 40)) ? '國際暗空勝地' : /最美星空/.test(p.cert) ? '台東最美星空' : '暗空推動中'; }

/* ---------- 選擇器、月份與日期軸 ---------- */
function fillSelectors(){
  $('selRegion').innerHTML = '<option value="all">全台灣</option>' + SM.REGIONS.map(function(r){ return '<option value="' + r.id + '">' + r.name + '｜' + r.sub + '</option>'; }).join('');
  $('selRegion').value = st.region;
  $('selSpot').innerHTML = '<option value="">' + (st.region === 'all' ? '選一個觀星點…' : '整個' + SM.regionById[st.region].name) + '</option>' +
    spotsInScope().map(function(p){ return '<option value="' + p.id + '">' + p.name + '</option>'; }).join('');
  $('selSpot').value = st.spot || '';
}
function renderAxis(){
  var y = st.y, m = st.m, nd = AS.daysIn(y, m), sp = spotsInScope(), html = '';
  $('mons').innerHTML = '<button type="button" class="yb" data-yr="-1" aria-label="前一年">‹</button><b>' + y + '</b><button type="button" class="yb" data-yr="1" aria-label="下一年">›</button>' +
    SM.MON.map(function(n, k){ return '<button type="button" class="mb' + (k + 1 === m ? ' on' : '') + '" data-mon="' + (k + 1) + '">' + (k + 1) + '<small>月</small></button>'; }).join('');
  var tn = tonight();
  for (var d = 1; d <= nd; d++){
    var n = AS.night(y, m, d), good = sp.filter(function(p){ return SM.score(p, y, m, d).score >= 4; }).length, sh = SM.showersNear(y, m, d).filter(function(s){ return s.dd === 0; })[0];
    var isT = y === tn.y && m === tn.m && d === tn.d;
    html += '<button type="button" class="dc' + (d === st.d ? ' on' : '') + (isT ? ' today' : '') + (good ? ' g' + Math.min(4, Math.ceil(good / Math.max(1, sp.length) * 4)) : '') + '" data-d="' + d + '" title="' + m + '/' + d + '（' + wday(y, m, d) + '）' + n.phase + '，無月暗夜 ' + fmtH(n.darkH) + ' 小時，' + good + ' 個觀星點指數 4 以上' + (sh ? '｜' + sh.name + '極大' : '') + '">' +
      AS.moonSvg(n.illum, n.waxing, 15) + '<span>' + d + '</span>' + (sh ? '<i class="met">☄</i>' : '') + '</button>';
  }
  $('days').innerHTML = html;
  var on = $('days').querySelector('.dc.on'); if (on && on.scrollIntoView && innerWidth <= 760) on.scrollIntoView({inline:'center', block:'nearest'});
}

/* ---------- 清單 ---------- */
function spotCard(p){
  var r = SM.score(p, st.y, st.m, st.d), h = hlNow(p, st.m).filter(function(x){ return x[0] !== '全年'; });
  var vn = spotLogs(p.id).length;
  return '<button type="button" class="scard" data-spot="' + p.id + '"><b>' + SM.TYPES[p.type].icon + ' ' + esc(p.name) + (vn ? ' <span class="visited" title="你在這裡觀星過 ' + vn + ' 次">★' + vn + '</span>' : '') + '</b>' + scoreChip(r.score) +
    '<small>' + (certShort(p) ? '<span class="cert">★ ' + certShort(p) + '</span> ' : '') + esc(p.city.replace(/（.*）/, '')) + '・海拔約 ' + p.elev.toLocaleString() + ' m・光害' + SM.LP[p.lp].name +
    (r.why.length ? '｜' + r.why.join('、') : '') + (h.length ? '<br>' + h.map(function(x){ return x[1] + ' ' + esc(x[2]); }).join('　') : '') + '</small></button>';
}
function nightBox(n, fc){
  var selMs = skyNow();
  var tl = function(ms){ return ms ? AS.hm(ms) : '—'; };
  var mr = n.mrise ? AS.hm(n.mrise) : '（白天已升起）', ms = n.mset ? AS.hm(n.mset) : '（隔天中午後）';
  return '<div class="nbox"><div class="mbig">' + AS.moonSvg(n.illum, n.waxing, 46) + '<div><b>' + n.phase + '</b><small>月齡 ' + n.age.toFixed(1) + '・亮 ' + Math.round(n.illum * 100) + '%</small></div></div>' +
    '<dl><dt>天黑（天文昏影終）</dt><dd>' + tl(n.dusk) + '</dd><dt>天亮（天文晨光始）</dt><dd>' + tl(n.dawn) + '</dd>' +
    '<dt>月出／月落</dt><dd>' + mr + '／' + ms + '</dd>' +
    '<dt>無月暗夜</dt><dd><b>' + fmtH(n.darkH) + ' 小時</b>' + (n.darkFrom ? '（' + AS.hm(n.darkFrom) + '～' + AS.hm(n.darkTo) + '）' : '') + '</dd>' +
    '<dt>銀河核心</dt><dd>' + (n.gcH > 0 ? '<b>' + fmtH(n.gcH) + ' 小時</b>（' + AS.hm(n.gcFrom) + '～' + AS.hm(n.gcTo) + '，南方）' : '暗夜時段看不到') + '</dd></dl>' + timeline(n, fc, selMs) + '</div>';
}
/* 今晚逐小時時間軸：18:00～隔天 06:00，每 5 分鐘一格 */
function timeline(n, fc, selMs){
  var S = n.samp; if (!S) return '';
  var I0 = 72, I1 = 216, W = I1 - I0;                  // 中午起第 72 格＝18:00
  var moonA = (.25 + .75 * n.illum).toFixed(2);
  var nowMark = '', now = Date.now(), i0ms = n.t0 + I0 * n.step;
  if (now >= i0ms && now <= n.t0 + I1 * n.step) nowMark = '<i class="now" style="left:' + ((now - i0ms) / (W * n.step) * 100).toFixed(2) + '%" title="現在"></i>';
  var selMark = selMs ? '<i class="sel" style="left:' + ((selMs - i0ms) / (W * n.step) * 100).toFixed(2) + '%"></i>' : '';
  function skyC(a){ return a > 0 ? '#5d82c4' : a > -6 ? '#3b5191' : a > -12 ? '#28376f' : a > -18 ? '#1a2350' : '#060a1a'; }
  function row(fn){                                    // 連續同色的格子合併成一個矩形
    var out = '', cur = null, from = 0;
    for (var i = I0; i <= I1; i++){
      var c = i < I1 ? fn(i) : null;
      if (c !== cur){ if (cur) out += '<rect x="' + (from - I0) + '" y="0" width="' + (i - from) + '" height="1" fill="' + cur + '"/>'; cur = c; from = i; }
    }
    return '<div class="bar"><svg viewBox="0 0 ' + W + ' 1" preserveAspectRatio="none" aria-hidden="true">' + out + '</svg>' + nowMark + selMark + '</div>';
  }
  var dark = function(i){ return S.sun[i] < -18 && (S.moon[i] <= -.6 || n.illum < .06); };
  var ticks = [18, 20, 22, 0, 2, 4, 6].map(function(h, k){ return '<span style="left:' + (k / 6 * 100).toFixed(2) + '%">' + ('0' + h).slice(-2) + '</span>'; }).join('');
  return '<div class="tl" aria-label="今晚逐小時：天色、月亮、無月暗夜與銀河核心時段">' +
    '<span>天色</span>' + row(function(i){ return skyC(S.sun[i]); }) +
    '<span>月亮</span>' + row(function(i){ return S.moon[i] > -.6 ? 'rgba(255,240,200,' + moonA + ')' : null; }) +
    '<span>暗夜</span>' + row(function(i){ return dark(i) ? '#e6c36a' : null; }) +
    '<span>銀河</span>' + row(function(i){ return dark(i) && S.gc[i] > 10 ? '#b8a6ff' : null; }) +
    (fc ? '<span>雲量</span>' + row(function(i){
      var k = Math.round((n.t0 + i * n.step - fc.src.t0) / 3600000), c = fc.src.c[k];
      return c == null ? null : 'rgba(205,214,236,' + (Math.round(c / 10) / 10 * .85).toFixed(2) + ')';
    }) : '') +
    '<span></span><div class="ticks">' + ticks + '</div></div>' +
    '<div class="tlnote"><i style="background:#060a1a;border:1px solid #445"></i>全黑<i style="background:rgba(255,240,200,' + moonA + ')"></i>月亮在天上<i style="background:#e6c36a"></i>無月暗夜<i style="background:#b8a6ff"></i>銀河核心（南方）' + (fc ? '<i style="background:rgba(205,214,236,.8)"></i>雲越白越多（預報）' : '') + (nowMark ? '<i style="background:var(--red);width:3px"></i>現在' : '') + (selMark ? '<i style="background:#fff;width:3px"></i>3D 星空的時間' : '') + '</div>';
}
/* 今晚的行星 */
function fmtMag(m){ return (m < 0 ? '−' : '') + Math.abs(m).toFixed(1); }
function magWord(m){ return m < -3 ? '非常亮' : m < -1 ? '很亮' : m < 1 ? '明顯' : '要找一下'; }
function planetBox(lat, lon){
  var pl = AS.planets(st.y, st.m, st.d, lat, lon), vis = pl.filter(function(p){ return p.visible; }), hid = pl.filter(function(p){ return !p.visible; });
  return '<div class="plist"><div class="sublbl">🪐 今晚看得到的行星（肉眼）</div>' +
    (vis.length ? vis.map(function(p){
      return '<div class="pl"><i style="background:' + p.c + ';box-shadow:0 0 6px ' + p.c + '"></i><b>' + p.name + '</b><em title="星等越小越亮">' + fmtMag(p.mag) + ' 等・' + magWord(p.mag) + '</em>' +
        '<span>' + p.when + ' ' + AS.hm(p.from) + '～' + AS.hm(p.to) + '，最高 ' + AS.hm(p.best) + ' 在' + p.dir + '方 ' + Math.round(p.bestAlt) + '°' + (p.bestAlt < 15 ? '（很低，要地平線開闊）' : '') + '</span></div>';
    }).join('') : '<div class="pl none">今晚天黑後沒有亮行星</div>') +
    (hid.length ? '<div class="plh">看不到：' + hid.map(function(p){ return p.name + '（' + p.why + '）'; }).join('、') + '</div>' : '') + '</div>';
}
function planetNames(){ return AS.planets(st.y, st.m, st.d).filter(function(p){ return p.visible && p.bestAlt >= 15; }).map(function(p){ return p.name; }); }
/* ---------- 3D 星空時間：預設＝今晚的現在，或銀河／暗夜最好的時間；滑桿 18:00～06:00 ---------- */
var skyLive = false, skyPlayT = 0, skyLiveT = 0;
function curNight(){ var sp = st.spot ? SM.spotById[st.spot] : null; return sp ? AS.night(st.y, st.m, st.d, sp.at[1], sp.at[0]) : AS.night(st.y, st.m, st.d); }
function skyLatLon(){ var sp = st.spot ? SM.spotById[st.spot] : null; return sp ? [sp.at[1], sp.at[0]] : [23.7, 121.0]; }
function skyNow(){
  var n = curNight();
  if (st.skyMs != null){ skyLive = false; return st.skyMs; }
  var now = Date.now();
  if (now >= n.t0 + 6 * 3600000 && now <= n.t0 + 18 * 3600000){ skyLive = true; return now; }
  skyLive = false;
  return n.gcH > 0 ? (n.gcFrom + n.gcTo) / 2 : n.darkH > 0 ? (n.darkFrom + n.darkTo) / 2 : n.t0 + 10 * 3600000;
}
function skyIdx(n, ms){ return Math.max(72, Math.min(216, Math.round((ms - n.t0) / n.step))); }
function skyDesc(n, ms){
  var i = skyIdx(n, ms), S = n.samp, sa = S.sun[i], up = S.moon[i] > -.6 && n.illum > .06, dk = sa < -18 && !up;
  return (sa > -6 ? '天色還亮' : sa > -18 ? '微光中' : up ? '月亮在天上' : '全黑') + (dk && S.gc[i] > 10 ? '・銀河核心在南方 ' + Math.round(S.gc[i]) + '°' : '');
}
function skyBox(){
  var n = curNight(), ms = skyNow(), look = window.StarScene && StarScene.isLookUp && StarScene.isLookUp(), tn = tonight(), isT = st.y === tn.y && st.m === tn.m && st.d === tn.d;
  return '<div class="skyt"><div class="skyrow"><b>🌌 3D 星空</b><span id="skyClock">' + skyClockText(n, ms) + '</span></div>' +
    '<input type="range" id="skyRange" min="72" max="216" step="1" value="' + skyIdx(n, ms) + '" aria-label="3D 星空顯示的時間（18:00～隔天 06:00）">' +
    '<div class="skybtns"><button type="button" class="abtn" data-sky="play">' + (skyPlayT ? '❚❚ 暫停' : '▶ 看整晚轉動') + '</button>' +
    (isT ? '<button type="button" class="abtn" data-sky="now">🕘 現在</button>' : '') +
    (st.spot ? '<button type="button" class="abtn' + (look ? ' on' : '') + '" data-sky="look" aria-pressed="' + (look ? 'true' : 'false') + '">🔭 ' + (look ? '回到俯瞰' : '仰望星空') + '</button>' : '') + '</div>' +
    '<div class="skyhint">' + (st.spot ? (look ? '拖曳畫面可以環顧四周（預設面向南方）；星座、亮星、行星與銀河都在這個時間的實際位置。' : '按「仰望星空」從觀星點抬頭看；拖曳時間條看星空整晚怎麼轉。') :
      '選一個觀星點再按「仰望星空」，能看到星座、行星與銀河在天上的實際位置。') + '</div></div>';
}
function skyClockText(n, ms){ return AS.hm(ms) + (skyLive ? '（現在）' : '') + '・' + skyDesc(n, ms); }
function pushSky(){ if (!window.StarScene) return; var ll = skyLatLon(); StarScene.setSky(skyNow(), ll[0], ll[1]); }
function updateSkyUI(){
  var n = curNight(), ms = skyNow(), i0ms = n.t0 + 72 * n.step, left = ((ms - i0ms) / (144 * n.step) * 100).toFixed(2) + '%';
  var c = $('skyClock'); if (c) c.textContent = skyClockText(n, ms);
  var r = $('skyRange'); if (r && document.activeElement !== r) r.value = skyIdx(n, ms);
  document.querySelectorAll('.tl .sel').forEach(function(el){ el.style.left = left; });
  pushSky();
}
function setSkyIdx(i){ var n = curNight(); st.skyMs = n.t0 + i * n.step; updateSkyUI(); }
function stopSkyPlay(){ if (!skyPlayT) return; clearInterval(skyPlayT); skyPlayT = 0; var b = document.querySelector('[data-sky="play"]'); if (b) b.textContent = '▶ 看整晚轉動'; }
function startSkyPlay(){
  var n = curNight(), i = skyIdx(n, skyNow()); if (i >= 214) i = 72;
  skyPlayT = setInterval(function(){ if (++i > 216){ stopSkyPlay(); return; } setSkyIdx(i); }, 110);
  var b = document.querySelector('[data-sky="play"]'); if (b) b.textContent = '❚❚ 暫停';
}
function toggleLook(){
  if (!window.StarScene || !StarScene.ready) return;
  var on = StarScene.lookUp(!StarScene.isLookUp());
  if (on && innerWidth <= 760) setSheet(true);
  var b = document.querySelector('[data-sky="look"]');
  if (b){ b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = '🔭 ' + (on ? '回到俯瞰' : '仰望星空'); }
  var h = document.querySelector('.skyhint'); if (h) h.textContent = on ? '拖曳畫面可以環顧四周（預設面向南方）；星座、亮星、行星與銀河都在這個時間的實際位置。' : '按「仰望星空」從觀星點抬頭看；拖曳時間條看星空整晚怎麼轉。';
}
function showerBox(){
  var sh = SM.showersNear(st.y, st.m, st.d);
  if (!sh.length) return '';
  return '<div class="shower">' + sh.map(function(s){ return '☄ <b>' + s.name + '</b>' + (s.dd === 0 ? '今晚極大' : s.dd < 0 ? '再 ' + (-s.dd) + ' 天極大' : '極大後第 ' + s.dd + ' 天') + '（ZHR 約 ' + s.zhr + '）：' + esc(s.tip); }).join('<br>') + '</div>';
}
function weekStrip(p){
  var cells = '';
  for (var k = 0; k < 14; k++){
    var q = AS.addDays(st.y, st.m, st.d, k), r = SM.score(p, q[0], q[1], q[2]), n = r.night;
    cells += '<button type="button" class="yc s' + r.score + (k === 0 ? ' on' : '') + (r.fc ? ' fc' : '') + '" data-ymd="' + q.join('-') + '" title="' + q[1] + '/' + q[2] + '：' + SM.SCORES[r.score].name + '，無月暗夜 ' + fmtH(n.darkH) + ' 小時' + (r.fc ? '，預報雲量 ' + Math.round(r.fc.cloud) + '%' : '') + '">' + AS.moonSvg(n.illum, n.waxing, 12) + '<span>' + q[2] + '</span></button>';
  }
  return '<div class="ystrip" aria-label="未來兩週觀星指數">' + cells + '</div>';
}
/* 某觀星點從某天之後 60 天內最適合的晚上：取這段期間能達到的最高指數，優先無月暗夜 ≥ 4 小時，依日期取前幾晚 */
function spotCands(p, y, m, d, n){
  var all = [];
  for (var k = 1; k <= 60; k++){ var q = AS.addDays(y, m, d, k), r = SM.score(p, q[0], q[1], q[2]); all.push({q:q, r:r}); }
  var peak = Math.max.apply(null, all.map(function(x){ return x.r.score; }));
  var top = all.filter(function(x){ return x.r.score === peak; }), long = top.filter(function(x){ return x.r.night.darkH >= 4; });
  return (long.length ? long : top).slice(0, n || 3);
}
function candBox(p){
  var c = spotCands(p, st.y, st.m, st.d, 3);
  return '<div class="sublbl">接下來最適合去的晚上（60 天內）</div><div class="cands">' + c.map(function(x){
    var q = x.q, n = x.r.night, sh = SM.showersNear(q[0], q[1], q[2]).filter(function(s){ return s.dd === 0; })[0];
    return '<button type="button" class="cand s' + x.r.score + '" data-ymd="' + q.join('-') + '" title="' + SM.SCORES[x.r.score].name + '，' + n.phase + '，無月暗夜 ' + fmtH(n.darkH) + ' 小時">' + AS.moonSvg(n.illum, n.waxing, 13) +
      q[1] + '/' + q[2] + '（' + wday(q[0], q[1], q[2]) + '）<small>暗 ' + fmtH(n.darkH) + 'h' + (sh ? '・☄' : '') + '</small></button>';
  }).join('') + '</div>';
}
/* 分享與行事曆 */
function shareText(){
  var y = st.y, m = st.m, d = st.d, sp = st.spot ? SM.spotById[st.spot] : null, r = sp ? SM.score(sp, y, m, d) : null, n = r ? r.night : AS.night(y, m, d);
  return '🌌 ' + m + '/' + d + '（' + wday(y, m, d) + '）' + (sp ? sp.name + '・觀星指數「' + SM.SCORES[r.score].name + '」' : '台灣夜空') + '：' + n.phase + '，無月暗夜 ' + fmtH(n.darkH) + ' 小時' +
    (n.darkFrom ? '（' + AS.hm(n.darkFrom) + '～' + AS.hm(n.darkTo) + '）' : '') + (n.gcH > 0 ? '，銀河核心 ' + AS.hm(n.gcFrom) + '～' + AS.hm(n.gcTo) : '') + (r && r.fc ? '，預報雲量 ' + Math.round(r.fc.cloud) + '%' : '') +
    (planetNames().length ? '，行星：' + planetNames().join('、') : '') + '｜出發前請再看天氣預報';
}
function shareNight(){
  var url = shareUrl(), text = shareText(), all = text + '\n' + url;
  if (navigator.share){ navigator.share({title:'台灣觀星地圖', text:text, url:url}).catch(function(){}); return; }
  var fail = function(){ toast('無法自動複製，請手動複製網址列的連結'); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(all).then(function(){ toast('已複製分享文字與連結，可以貼到 LINE'); }, fail);
  else fail();
}
function icsEsc(s){ return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
function icsTime(ms){ return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); }
function icsFold(line){                                // RFC 5545：每行不超過 75 位元組
  var out = [], cur = '', len = 0;
  Array.from(line).forEach(function(ch){ var b = new TextEncoder().encode(ch).length; if (len + b > 73){ out.push(cur); cur = ' '; len = 1; } cur += ch; len += b; });
  out.push(cur); return out.join('\r\n');
}
function buildIcs(){
  var y = st.y, m = st.m, d = st.d, sp = st.spot ? SM.spotById[st.spot] : null, r = sp ? SM.score(sp, y, m, d) : null, n = r ? r.night : AS.night(y, m, d);
  var from = n.darkFrom || n.dusk, to = n.darkTo || n.dawn;
  if (!from || !to) return null;
  var title = '🌌 觀星：' + (sp ? sp.name : '台灣夜空') + (n.darkFrom ? '（無月暗夜）' : '（月光較亮）');
  var desc = shareText() + '\n天黑 ' + (n.dusk ? AS.hm(n.dusk) : '—') + '／天亮 ' + (n.dawn ? AS.hm(n.dawn) : '—') + '\n月相與時間依天文公式估算；天氣與道路請出發前再確認。\n' + shareUrl();
  var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//taiwan-stargazing-map//ZH-TW', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + y + ('0' + m).slice(-2) + ('0' + d).slice(-2) + '-' + (sp ? sp.id : 'tw') + '-' + Date.now() + '@taiwan-stargazing-map', 'DTSTAMP:' + icsTime(Date.now()),
    'DTSTART:' + icsTime(from), 'DTEND:' + icsTime(to), 'SUMMARY:' + icsEsc(title), 'DESCRIPTION:' + icsEsc(desc), 'URL:' + shareUrl()];
  if (sp){ L.push('LOCATION:' + icsEsc(sp.name + '，' + sp.city)); L.push('GEO:' + sp.at[1].toFixed(4) + ';' + sp.at[0].toFixed(4)); }
  L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc('觀星準備：看雲量預報、帶保暖衣物與紅光手電筒'), 'TRIGGER:-PT3H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return {text:L.map(icsFold).join('\r\n') + '\r\n', name:'stargazing-' + y + ('0' + m).slice(-2) + ('0' + d).slice(-2) + (sp ? '-' + sp.id : '') + '.ics'};
}
function downloadIcs(){
  var f = buildIcs(); if (!f){ toast('這天晚上沒有完整的天黑時段'); return; }
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.text], {type:'text/calendar;charset=utf-8'})); a.download = f.name;
  document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('已下載行事曆檔（.ics），打開就能加入手機或 Google 行事曆');
}
function actsBox(){
  var v = st.spot ? spotLogs(st.spot) : [], last = v.map(function(L){ return L.date; }).sort().pop();
  return '<div class="acts"><button type="button" class="abtn" data-act="share">🔗 分享這晚</button><button type="button" class="abtn" data-act="ics">📅 加入行事曆</button><button type="button" class="abtn" data-act="log">✍ 記錄這晚</button></div>' +
    (v.length ? '<div class="fcnote"><span class="visited">★ 蓋過章</span>：你在這裡觀星過 ' + v.length + ' 次（最近 ' + last.replace(/-/g, '/') + '）</div>' : '');
}
function fcNote(){
  return '<div class="fcnote">' + (fcState === 'loading' ? '☁ 正在讀取雲量預報…' : fcState === 'fail' ? '☁ 雲量預報暫時讀不到，指數用氣候粗估。' :
    '☁ 這天超過預報範圍（約 7 天），指數用氣候粗估；7 天內會改用雲量預報。') + '</div>';
}
function render(opts){
  opts = opts || {};
  var y = st.y, m = st.m, d = st.d, sp = st.spot ? SM.spotById[st.spot] : null, n = AS.night(y, m, d);
  $('dateBig').innerHTML = m + '/' + d + '<small>（' + wday(y, m, d) + '）</small>';
  $('dateSub').textContent = y + ' 年・' + n.phase;
  $('moonNow').innerHTML = AS.moonSvg(n.illum, n.waxing, 34);
  renderAxis();
  $('btnLayer').classList.toggle('on', st.layer);
  $('btnNext').title = sp ? '往後找「' + sp.name + '」接下來最適合的晚上（60 天內這裡能達到的最高指數）' : '往後找下一個無月暗夜 6 小時以上、有觀星點指數 5 的晚上';
  var place = $('place'), list = $('list'), scope = spotsInScope();
  var good = scope.filter(function(p){ return SM.score(p, y, m, d).score >= 4; }).length;
  if (sp){
    var r = SM.score(sp, y, m, d), ns = r.night, h = hlNow(sp, m), gear = SM.gear(sp, r);
    place.innerHTML = '<h2>' + esc(sp.name) + '<small>' + esc(sp.city) + '</small></h2>' +
      '<div class="meta">' + scoreChip(r.score, '（' + m + '/' + d + '）') + lpChip(sp.lp) + '<span>' + SM.TYPES[sp.type].icon + ' ' + SM.TYPES[sp.type].name + '</span><span>海拔約 ' + sp.elev.toLocaleString() + ' m</span></div>' +
      (sp.cert ? '<div class="certbox">★ ' + esc(sp.cert) + '</div>' : '') +
      nightBox(ns, r.fc) + skyBox() + planetBox(sp.at[1], sp.at[0]) + showerBox() +
      (r.fc ? '<div class="wxrow"><span class="clr fcb">☁ 預報' + SM.cloudName(r.fc.cloud) + '：雲量平均 ' + Math.round(r.fc.cloud) + '%' + (r.fc.tmin != null ? '・夜間低溫約 ' + Math.round(r.fc.tmin) + '°C' : '') + '</span>' +
          '<span class="fcsrc">模式預報，更新於 ' + fcUpdated() + '・<a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></span></div>' +
          (r.wx.length ? '<div class="wxrow"><span class="clr">這個月常見：</span>' + wxChips(r.wx) + '</div>' : '')
        : '<div class="wxrow"><span class="clr">晴夜機會（' + m + '月粗估）：' + (r.clear >= .85 ? '高' : r.clear >= .6 ? '中' : '低') + '</span>' + wxChips(r.wx) + '</div>' + fcNote()) +
      '<div class="sublbl">未來兩週<em>（底線＝已用雲量預報）</em></div>' + weekStrip(sp) + candBox(sp) + actsBox() +
      (h.length ? '<ul class="hl">' + h.map(function(x){ return '<li>' + x[1] + ' ' + esc(x[2]) + '</li>'; }).join('') + '</ul>' : '') +
      '<p>' + esc(sp.note) + '</p>' +
      '<div class="gear"><b>🎒 建議帶：</b>' + gear.map(function(g){ return '<span>' + esc(g) + '</span>'; }).join('') + '</div>' +
      '<details class="tips"' + (innerWidth > 760 ? ' open' : '') + '><summary>📌 這裡要注意</summary><ul>' + sp.tips.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></details>' +
      '<dl class="facts"><dt>管理</dt><dd>' + esc(sp.mgr) + '</dd><dt>開放</dt><dd>道路、園區與夜間規定以管理單位公告為準</dd></dl>';
    $('sum').innerHTML = '<span>' + esc(SM.SCORES[r.score].tip) + '</span>';
    list.className = 'mini';
    list.innerHTML = '<div class="lgrp">同區的其他觀星點</div>' + SM.SPOTS.filter(function(p){ return p.r === sp.r && p.id !== sp.id; }).map(spotCard).join('');
  } else {
    var rg = st.region === 'all' ? null : SM.regionById[st.region];
    var best = scope.slice().sort(function(a, b){ return SM.score(b, y, m, d).v - SM.score(a, y, m, d).v; })[0];
    var pn = planetNames(), anyFc = scope.some(function(p){ return SM.score(p, y, m, d).fc; });
    place.innerHTML = '<h2>' + m + '/' + d + ' 的夜空<small>' + (rg ? rg.name + '・' : '全台灣・') + scope.length + ' 個觀星點</small></h2>' + nightBox(n) + skyBox() + planetBox() + showerBox() +
      '<p>' + (good ? '今晚有 <b>' + good + '</b> 個觀星點指數 4 以上，最推薦：<button type="button" class="lnk" data-spot="' + best.id + '">' + esc(best.name) + '</button>。' : n.darkH < 2 ? '月光很亮，適合賞月' + (pn.length ? '、看' + pn.join('、') : '與看亮星') + '；想看銀河請挑新月前後。' : '條件普通，挑光害少、天氣好的地方。') +
      (anyFc ? '指數已用雲量預報（<a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>，' + fcUpdated() + ' 更新）。' : '') +
      (st.layer ? '地圖上橘黃色的光暈是城市光害（示意）。' : '') + '時間以台灣中部估算，各地相差幾分鐘。</p>' + (anyFc ? '' : fcNote()) + actsBox();
    $('sum').innerHTML = '<span>' + m + '/' + d + '・' + (rg ? rg.name : '全台灣') + '</span><b>' + good + '</b><span>個觀星點指數 4 以上</span>';
    list.className = '';
    var sorted = scope.slice().sort(function(a, b){ return SM.score(b, y, m, d).v - SM.score(a, y, m, d).v; }), html = '', last = '';
    sorted.forEach(function(p){
      var s = SM.score(p, y, m, d).score, g = s >= 4 ? '🌌 今晚值得去' : s === 3 ? '✨ 天氣好可以看' : '🌙 今晚條件普通';
      if (g !== last){ html += '<div class="lgrp">' + g + '</div>'; last = g; }
      html += spotCard(p);
    });
    list.innerHTML = html;
  }
  if (window.StarScene && StarScene.ready){
    StarScene.setDate(y, m, d); StarScene.selectSpot(st.spot); StarScene.setLayer(st.layer); pushSky();
    if (opts.fly){
      if (sp) StarScene.focusSpot(sp.id);
      else if (st.region !== 'all') StarScene.focusRegion(scope.map(function(p){ return p.id; }));
      else StarScene.overview();
    }
  }
  save();
}

/* ---------- 動作 ---------- */
function setDate(y, m, d){
  st.skyMs = null; stopSkyPlay();
  var t = new Date(Date.UTC(y, m - 1, d)); st.y = t.getUTCFullYear(); st.m = t.getUTCMonth() + 1; st.d = t.getUTCDate();
  if (st.y < 2000){ st.y = 2000; } if (st.y > 2099){ st.y = 2099; }
  render();
}
function shiftDay(k){ var q = AS.addDays(st.y, st.m, st.d, k); setDate(q[0], q[1], q[2]); }
function setMonth(m){ setDate(st.y, m, Math.min(st.d, AS.daysIn(st.y, m))); }
function selectSpot(id){ if (id && innerWidth <= 760 && $('panel').classList.contains('min')) setSheet(false); st.spot = id || null; if (st.spot) st.region = SM.spotById[st.spot].r; fillSelectors(); render({fly:true}); }
function selectRegion(r){ st.region = r; st.spot = null; fillSelectors(); render({fly:true}); }
function setLayer(on){ st.layer = !!on; render(); }
/* 找下一個好夜晚（全台最佳觀星點指數 5 且無月暗夜 ≥ 6 小時） */
function nextGood(){
  if (st.spot){ var c = spotCands(SM.spotById[st.spot], st.y, st.m, st.d, 1)[0]; if (c){ setDate(c.q[0], c.q[1], c.q[2]); toast(c.q[1] + '/' + c.q[2] + '：' + SM.spotById[st.spot].name + '接下來最適合的晚上'); } return; }
  for (var k = 1; k <= 60; k++){
    var q = AS.addDays(st.y, st.m, st.d, k), n = AS.night(q[0], q[1], q[2]);
    if (n.darkH >= 6 && spotsInScope().some(function(p){ return SM.score(p, q[0], q[1], q[2]).score >= 5; })){ setDate(q[0], q[1], q[2]); return; }
  }
}

var lastFocus = null;
function openModal(id){ lastFocus = document.activeElement; $(id).classList.add('show'); $(id).querySelector('.x').focus(); }
function closeModal(el){
  el.classList.remove('show');
  if (el.id === 'about') lsSet(SEEN_KEY, 1);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function buildEtiquette(){
  $('etqBody').innerHTML = SM.ETIQUETTE.map(function(e){
    return '<section><h3>' + e.icon + ' ' + esc(e.title) + '</h3><ul>' + e.items.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
  }).join('');
  $('glossBody').innerHTML = SM.GLOSSARY.map(function(g){ return '<div><b>' + esc(g[0]) + '</b><br>' + esc(g[1]) + '</div>'; }).join('');
  $('showerBody').innerHTML = SM.SHOWERS.map(function(s){ return '<div><b>☄ ' + esc(s.name) + '</b>　' + s.m + '/' + s.d + ' 前後・ZHR 約 ' + s.zhr + '<br>' + esc(s.tip) + '</div>'; }).join('');
  $('lgScore').innerHTML = [5, 4, 3, 2, 1].map(function(s){ return '<span><i style="background:' + SM.SCORES[s].c + '"></i>' + SM.SCORES[s].name + '</span>'; }).join('');
}

/* ---------- 觀星護照：紀錄只存在本機 localStorage ---------- */
var LOG_KEY = 'taiwanStarLog';
var SAW = [['mw', '🌌 銀河'], ['meteor', '☄ 流星'], ['planet', '🪐 行星'], ['const', '✨ 星座'], ['moon', '🌙 月亮'], ['dso', '🔭 星團星雲'], ['cloud', '☁ 雲太多沒看到']];
function logs(){ var a = lsGet(LOG_KEY, []); return Array.isArray(a) ? a : []; }
function saveLogs(a){ lsSet(LOG_KEY, a); }
function ymdStr(y, m, d){ return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2); }
function spotLogs(id){ return logs().filter(function(L){ return L.spot === id; }); }
var BADGES = [
  {id:'first', icon:'🌠', name:'第一次觀星', tip:'記下第一筆觀星紀錄', ok:function(a){ return a.length >= 1; }},
  {id:'mw', icon:'🌌', name:'銀河獵人', tip:'記錄看到銀河', ok:function(a){ return a.some(function(L){ return L.saw.indexOf('mw') >= 0; }); }},
  {id:'dark', icon:'🏞', name:'走進暗空公園', tip:'在合歡山暗空公園或拉拉山暗空勝地觀星', ok:function(a){ return a.some(function(L){ var p = SM.spotById[L.spot]; return p && /國際暗空/.test(certShort(p)); }); }},
  {id:'shower', icon:'☄', name:'流星雨之夜', tip:'在流星雨極大前後一天觀星', ok:function(a){ return a.some(function(L){ var q = L.date.split('-').map(Number); return SM.showersNear(q[0], q[1], q[2]).some(function(s){ return Math.abs(s.dd) <= 1; }); }); }},
  {id:'newmoon', icon:'🌑', name:'新月之夜', tip:'在月亮照亮不到 5% 的晚上觀星', ok:function(a){ return a.some(function(L){ var q = L.date.split('-').map(Number); return AS.night(q[0], q[1], q[2]).illum < .05; }); }},
  {id:'alpine', icon:'🏔', name:'高山觀星', tip:'在海拔 2,500 公尺以上的觀星點觀星', ok:function(a){ return a.some(function(L){ var p = SM.spotById[L.spot]; return p && p.elev >= 2500; }); }},
  {id:'island', icon:'🏝', name:'離島星空', tip:'在綠島、澎湖或馬祖觀星', ok:function(a){ return a.some(function(L){ var p = SM.spotById[L.spot]; return p && p.type === 'island'; }); }},
  {id:'meteor10', icon:'💫', name:'流星收集家', tip:'累計記錄 10 顆流星', ok:function(a){ return a.reduce(function(t, L){ return t + (L.met || 0); }, 0) >= 10; }},
  {id:'regions', icon:'🧭', name:'走遍五區', tip:'北部、中部高山、南部、花東、離島都去過', ok:function(a){ var r = {}; a.forEach(function(L){ var p = SM.spotById[L.spot]; if (p) r[p.r] = 1; }); return Object.keys(r).length >= SM.REGIONS.length; }},
  {id:'ten', icon:'🔭', name:'十晚觀星家', tip:'累計 10 晚觀星紀錄', ok:function(a){ return a.length >= 10; }},
  {id:'all', icon:'👑', name:'全台觀星點制霸', tip:'15 個觀星點都蓋到章', ok:function(a){ var v = {}; a.forEach(function(L){ if (SM.spotById[L.spot]) v[L.spot] = 1; }); return Object.keys(v).length >= SM.SPOTS.length; }}
];
function renderPass(){
  var a = logs().slice().sort(function(x, y){ return x.date < y.date ? 1 : x.date > y.date ? -1 : y.at - x.at; });
  var visited = {}; a.forEach(function(L){ if (SM.spotById[L.spot]) (visited[L.spot] = visited[L.spot] || []).push(L.date); });
  var mwN = a.filter(function(L){ return L.saw.indexOf('mw') >= 0; }).length, met = a.reduce(function(t, L){ return t + (L.met || 0); }, 0);
  $('passStats').innerHTML = '<div><b>' + a.length + '</b>晚觀星紀錄</div><div><b>' + Object.keys(visited).length + '／' + SM.SPOTS.length + '</b>個觀星點蓋過章</div><div><b>' + mwN + '</b>次看到銀河</div><div><b>' + met + '</b>顆流星</div>';
  $('passStamps').innerHTML = SM.SPOTS.map(function(p){
    var v = visited[p.id], first = v ? v.slice().sort()[0] : '';
    return '<button type="button" class="stamp' + (v ? ' on' : '') + '" data-pspot="' + p.id + '" title="' + esc(p.name) + (v ? '：去過 ' + v.length + ' 次' : '：還沒去過') + '">' +
      (v ? '★ ' : '') + '<b>' + esc(p.name.replace(/合歡山暗空公園・/, '合歡山・').replace(/（.*）/, '')) + '</b><small>' + (v ? first.replace(/-/g, '.') + (v.length > 1 ? '・' + v.length + ' 次' : '') : '尚未造訪') + '</small></button>';
  }).join('');
  $('passBadges').innerHTML = BADGES.map(function(b){ var on = b.ok(a); return '<div class="badge' + (on ? ' on' : '') + '" title="' + esc(b.tip) + '"><i>' + b.icon + '</i><div><b>' + b.name + '</b>' + (on ? '已達成' : esc(b.tip)) + '</div></div>'; }).join('');
  $('passList').innerHTML = a.length ? a.map(function(L){
    var p = SM.spotById[L.spot], q = L.date.split('-').map(Number), n = AS.night(q[0], q[1], q[2]);
    return '<div class="lentry"><div class="lh"><b>' + q[1] + '/' + q[2] + '（' + wday(q[0], q[1], q[2]) + '）' + q[0] + '</b><span>' + esc(p ? p.name : (L.spotName || '其他地點')) + '</span><span>' + AS.moonSvg(n.illum, n.waxing, 13) + ' ' + n.phase + '</span>' +
      (L.rate ? '<em>' + '★★★★★'.slice(0, L.rate) + '</em>' : '') + '<button type="button" class="sbtn" data-edit="' + L.id + '">編輯</button></div>' +
      '<div class="ls">' + L.saw.map(function(k){ var x = SAW.filter(function(s){ return s[0] === k; })[0]; return x ? '<span>' + x[1] + (k === 'meteor' && L.met ? ' ' + L.met + ' 顆' : '') + '</span>' : ''; }).join('') +
      (L.saw.indexOf('meteor') < 0 && L.met ? '<span>☄ 流星 ' + L.met + ' 顆</span>' : '') + '</div>' + (L.note ? '<p>' + esc(L.note) + '</p>' : '') + '</div>';
  }).join('') : '<div class="lempty">還沒有紀錄。到觀星點的面板按「✍ 記錄這晚」，或按上面的「新增一筆」。</div>';
}
var editId = null, logRate = 0;
function openLog(id){
  var L = id ? logs().filter(function(x){ return x.id === id; })[0] : null, tn = tonight();
  editId = L ? L.id : null;
  $('logTitle').textContent = L ? '✍ 編輯觀星紀錄' : '✍ 記錄這晚';
  $('logSpot').innerHTML = SM.REGIONS.map(function(r){ return '<optgroup label="' + r.name + '">' + SM.SPOTS.filter(function(p){ return p.r === r.id; }).map(function(p){ return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '<option value="other">其他地點（不蓋章）</option>';
  var dDef = ymdStr(st.y, st.m, st.d); if (dDef > ymdStr(tn.y, tn.m, tn.d)) dDef = ymdStr(tn.y, tn.m, tn.d);
  $('logDate').value = L ? L.date : dDef; $('logDate').max = ymdStr(tn.y, tn.m, tn.d);
  $('logSpot').value = L ? (SM.spotById[L.spot] ? L.spot : 'other') : (st.spot || 'other');
  $('logSaw').innerHTML = SAW.map(function(x){ return '<label><input type="checkbox" value="' + x[0] + '"' + (L && L.saw.indexOf(x[0]) >= 0 ? ' checked' : '') + '>' + x[1] + '</label>'; }).join('');
  $('logMet').value = L ? (L.met || 0) : 0; $('logNote').value = L ? (L.note || '') : '';
  logRate = L ? (L.rate || 0) : 0; drawRate();
  $('logErr').textContent = ''; $('logDel').hidden = !L;
  openModal('logm');
}
function drawRate(){ $('logRate').innerHTML = [1, 2, 3, 4, 5].map(function(k){ return '<button type="button" data-rate="' + k + '" class="' + (k <= logRate ? 'on' : '') + '" aria-label="' + k + ' 顆星" aria-pressed="' + (k === logRate ? 'true' : 'false') + '">★</button>'; }).join(''); }
function saveLog(){
  var date = $('logDate').value, tn = tonight();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)){ $('logErr').textContent = '請選日期。'; return; }
  if (date > ymdStr(tn.y, tn.m, tn.d)){ $('logErr').textContent = '這天還沒到喔，觀星完再回來記錄。'; return; }
  var saw = [].map.call($('logSaw').querySelectorAll('input:checked'), function(i){ return i.value; });
  var met = Math.max(0, Math.min(999, Math.round(+$('logMet').value || 0)));
  if (met > 0 && saw.indexOf('meteor') < 0) saw.push('meteor');
  var spot = $('logSpot').value, a = logs(), rec = {id:editId || ('L' + Date.now().toString(36)), date:date, spot:spot, saw:saw, met:met, rate:logRate, note:$('logNote').value.trim().slice(0, 300), at:Date.now()};
  var before = BADGES.filter(function(b){ return b.ok(a); }).map(function(b){ return b.id; });
  a = a.filter(function(L){ return L.id !== rec.id; }); a.push(rec); saveLogs(a);
  var gained = BADGES.filter(function(b){ return b.ok(a) && before.indexOf(b.id) < 0; });
  closeModal($('logm'));
  toast(gained.length ? '🎉 獲得徽章：' + gained.map(function(b){ return b.icon + b.name; }).join('、') : SM.spotById[spot] ? '已蓋章：' + SM.spotById[spot].name : '已儲存紀錄');
  if ($('pass').classList.contains('show')) renderPass();
  render();
}
function delLog(){
  if (!editId) return;
  var b = $('logDel');
  if (b.dataset.confirm !== '1'){ b.dataset.confirm = '1'; b.textContent = '再按一次確定刪除'; setTimeout(function(){ b.dataset.confirm = ''; b.textContent = '🗑 刪除這筆'; }, 3000); return; }
  b.dataset.confirm = ''; b.textContent = '🗑 刪除這筆';
  saveLogs(logs().filter(function(L){ return L.id !== editId; })); closeModal($('logm')); toast('已刪除這筆紀錄');
  if ($('pass').classList.contains('show')) renderPass();
  render();
}
function exportLogs(){
  var a = document.createElement('a'), blob = new Blob([JSON.stringify({app:'taiwan-stargazing-map', v:1, at:new Date().toISOString(), logs:logs()}, null, 2)], {type:'application/json'});
  var tn = tonight(); a.href = URL.createObjectURL(blob); a.download = 'stargazing-passport-' + ymdStr(tn.y, tn.m, tn.d) + '.json';
  document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function importLogs(file){
  var rd = new FileReader();
  rd.onload = function(){
    try {
      var j = JSON.parse(rd.result), inc = Array.isArray(j) ? j : j.logs;
      if (!Array.isArray(inc)) throw new Error('格式不對');
      var ok = inc.filter(function(L){ return L && typeof L.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(L.date) && typeof L.spot === 'string' && Array.isArray(L.saw); }).map(function(L){
        return {id:L.id.slice(0, 40), date:L.date, spot:L.spot.slice(0, 40), saw:L.saw.filter(function(k){ return SAW.some(function(x){ return x[0] === k; }); }), met:Math.max(0, Math.min(999, +L.met || 0)), rate:Math.max(0, Math.min(5, +L.rate || 0)), note:String(L.note || '').slice(0, 300), at:+L.at || Date.now()};
      });
      var a = logs(), ids = {}; a.forEach(function(L){ ids[L.id] = 1; });
      var added = ok.filter(function(L){ return !ids[L.id]; }); saveLogs(a.concat(added));
      toast('匯入 ' + added.length + ' 筆紀錄' + (ok.length - added.length ? '（' + (ok.length - added.length) + ' 筆已存在，略過）' : ''));
      renderPass(); render();
    } catch (e){ toast('匯入失敗：檔案不是觀星護照的備份'); }
  };
  rd.readAsText(file);
}

/* ---------- 常用設定（收合式） ---------- */
function fillSettings(){
  $('setDate').value = set.date; $('setLayer').checked = set.layer !== false; $('setLabels').checked = !!set.labels; $('setMotion').value = set.motion; $('setTheme').value = set.theme; $('setPlay').value = String(set.play); $('setRed').checked = !!set.red; $('sv-red').textContent = set.red ? '開' : '關'; $('setSky').checked = set.sky !== false; $('sv-sky').textContent = set.sky !== false ? '顯示' : '隱藏';
  var txt = function(id){ var s = $(id); return s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : ''; };
  $('sv-date').textContent = txt('setDate'); $('sv-layer').textContent = set.layer !== false ? '開' : '關'; $('sv-labels').textContent = set.labels ? '顯示' : '隱藏';
  $('sv-motion').textContent = txt('setMotion'); $('sv-play').textContent = txt('setPlay').replace(/（.*/, ''); $('sv-theme').textContent = txt('setTheme');
  var open = lsGet(SEC_KEY, []);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.open = open.indexOf(d.dataset.sec) >= 0; });
}
function saveSettings(){
  set = {date:$('setDate').value, layer:$('setLayer').checked, labels:$('setLabels').checked, motion:$('setMotion').value, theme:$('setTheme').value, play:+$('setPlay').value, red:$('setRed').checked, sky:$('setSky').checked};
  lsSet(SET_KEY, set); applyTheme(); applyRed();
  if (window.StarScene && StarScene.ready){ StarScene.setLabels(set.labels); StarScene.setReduce(reduceOn()); StarScene.setConst(set.sky !== false); }
  if (playT){ stopPlay(); startPlay(); }
  fillSettings();
}
function saveSecs(){ lsSet(SEC_KEY, [].map.call(document.querySelectorAll('.set-sec[open]'), function(d){ return d.dataset.sec; })); }

/* ---------- 事件 ---------- */
function bind(){
  $('mons').addEventListener('click', function(e){
    var b = e.target.closest('[data-mon]'); if (b){ stopPlay(); setMonth(+b.dataset.mon); return; }
    var yb = e.target.closest('[data-yr]'); if (yb){ stopPlay(); setDate(st.y + +yb.dataset.yr, st.m, st.d); }
  });
  $('days').addEventListener('click', function(e){ var b = e.target.closest('.dc'); if (b){ stopPlay(); setDate(st.y, st.m, +b.dataset.d); } });
  $('btnNow').addEventListener('click', function(){ stopPlay(); var t = tonight(); setDate(t.y, t.m, t.d); });
  $('btnNext').addEventListener('click', function(){ stopPlay(); nextGood(); });
  $('btnLayer').addEventListener('click', function(){ setLayer(!st.layer); });
  $('btnRed').addEventListener('click', function(){ set.red = !set.red; lsSet(SET_KEY, set); applyRed(); toast(set.red ? '紅光夜視模式：開（手機亮度也請調到最低）' : '紅光夜視模式：關'); });
  window.addEventListener('hashchange', function(){ if (readHash()){ if (st.spot) st.region = SM.spotById[st.spot].r; fillSelectors(); render({fly:true}); } });
  $('selRegion').addEventListener('change', function(){ selectRegion(this.value); });
  $('selSpot').addEventListener('change', function(){ if (this.value) selectSpot(this.value); else selectRegion(st.region); });
  $('list').addEventListener('click', function(e){ var c = e.target.closest('.scard'); if (c) selectSpot(c.dataset.spot); });
  $('place').addEventListener('input', function(e){ if (e.target.id === 'skyRange'){ stopSkyPlay(); setSkyIdx(+e.target.value); } });
  $('place').addEventListener('click', function(e){
    var sk = e.target.closest('[data-sky]');
    if (sk){ var k = sk.dataset.sky; if (k === 'play'){ if (skyPlayT) stopSkyPlay(); else startSkyPlay(); } else if (k === 'now'){ stopSkyPlay(); st.skyMs = null; updateSkyUI(); } else toggleLook(); return; }
    var y = e.target.closest('[data-ymd]'); if (y){ stopPlay(); var q = y.dataset.ymd.split('-').map(Number); setDate(q[0], q[1], q[2]); return; }
    var a = e.target.closest('[data-act]'); if (a){ if (a.dataset.act === 'share') shareNight(); else if (a.dataset.act === 'log') openLog(); else downloadIcs(); return; }
    var s = e.target.closest('[data-spot]'); if (s) selectSpot(s.dataset.spot);
  });
  $('btnAll').addEventListener('click', function(){ st.region = 'all'; st.spot = null; fillSelectors(); render({fly:true}); });
  $('btnAbout').addEventListener('click', function(){ openModal('about'); });
  ['btnEtq', 'btnEtq2', 'btnEtq3'].forEach(function(id){ $(id).addEventListener('click', function(){ if (id === 'btnEtq3') closeModal($('about')); openModal('etq'); }); });
  $('btnSet').addEventListener('click', function(){ fillSettings(); openModal('settings'); });
  $('btnPass').addEventListener('click', function(){ renderPass(); openModal('pass'); });
  $('passAdd').addEventListener('click', function(){ openLog(); });
  $('passList').addEventListener('click', function(e){ var b = e.target.closest('[data-edit]'); if (b) openLog(b.dataset.edit); });
  $('passStamps').addEventListener('click', function(e){ var b = e.target.closest('[data-pspot]'); if (b){ closeModal($('pass')); selectSpot(b.dataset.pspot); } });
  $('passExport').addEventListener('click', exportLogs);
  $('passImport').addEventListener('change', function(){ if (this.files[0]) importLogs(this.files[0]); this.value = ''; });
  $('logRate').addEventListener('click', function(e){ var b = e.target.closest('[data-rate]'); if (b){ logRate = +b.dataset.rate === logRate ? 0 : +b.dataset.rate; drawRate(); } });
  $('logSave').addEventListener('click', saveLog);
  $('logDel').addEventListener('click', delLog);
  $('settings').addEventListener('change', saveSettings);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.addEventListener('toggle', saveSecs); });
  $('setOpenAll').addEventListener('click', function(){ document.querySelectorAll('.set-sec').forEach(function(d){ d.open = true; }); saveSecs(); });
  $('setCloseAll').addEventListener('click', function(){ document.querySelectorAll('.set-sec').forEach(function(d){ d.open = false; }); saveSecs(); });
  function openAbout(creator){
    if ($('settings').classList.contains('show')) closeModal($('settings'));
    openModal('about'); if (creator) $('creatorBox').scrollIntoView({block:'nearest'});
  }
  $('btnCreator').addEventListener('click', function(){ openAbout(true); });
  document.querySelectorAll('[data-open-about]').forEach(function(b){ b.addEventListener('click', function(){ openAbout(b.dataset.openAbout === 'creator'); }); });
  document.querySelectorAll('[data-open-etq]').forEach(function(b){ b.addEventListener('click', function(){ closeModal($('settings')); openModal('etq'); }); });
  $('sheetBtn').addEventListener('click', function(){ setSheet(!$('panel').classList.contains('min')); });
  document.querySelectorAll('.modal').forEach(function(m){
    m.addEventListener('click', function(e){ if (e.target === m || e.target.closest('[data-close]')) closeModal(m); });
  });
  document.addEventListener('keydown', function(e){
    var mods = document.querySelectorAll('.modal.show'), open = mods[mods.length - 1];   // 疊在最上面的對話框先關
    if (e.key === 'Escape' && open){ closeModal(open); return; }
    if (open || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight'){ stopPlay(); shiftDay(1); }
    if (e.key === 'ArrowLeft'){ stopPlay(); shiftDay(-1); }
    if (e.key === 'ArrowUp'){ e.preventDefault(); stopPlay(); setMonth(st.m === 12 ? 12 : st.m + 1); }
    if (e.key === 'ArrowDown'){ e.preventDefault(); stopPlay(); setMonth(st.m === 1 ? 1 : st.m - 1); }
  });
  $('play').addEventListener('click', function(){ if (playT) stopPlay(); else startPlay(); });
}
function setSheet(min){
  $('panel').classList.toggle('min', min); document.body.classList.toggle('sheet-min', min); $('sheetBtn').textContent = min ? '展開清單' : '收合';
  if (window.StarScene) StarScene.resize();
}
var playT = 0, played = 0;
function startPlay(){
  played = 0; $('play').classList.add('on'); $('play').textContent = '❚❚';
  playT = setInterval(function(){ if (++played > 30){ stopPlay(); return; } shiftDay(1); }, set.play || 900);
}
function stopPlay(){ if (!playT) return; clearInterval(playT); playT = 0; $('play').classList.remove('on'); $('play').textContent = '▶'; }

/* ---------- 啟動 ---------- */
fillSelectors(); buildEtiquette(); bind(); if (innerWidth <= 760) setSheet(true); render();
if (fcStale()) fcFetch();
skyLiveT = setInterval(function(){ if (st.skyMs == null && !skyPlayT){ var was = skyLive; skyNow(); if (was || skyLive) updateSkyUI(); } }, 60000);
document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible' && fcStale()) fcFetch(); });
StarScene.onPickSpot = function(id){ selectSpot(id); };
function firstVisit(){ if (!lsGet(SEEN_KEY, 0)) openModal('about'); }
StarScene.init({host:$('stage'), labels:$('labels'), reduce:reduceOn(), date:{y:st.y, m:st.m, d:st.d}, layer:st.layer}).then(function(){
  StarScene.setLabels(set.labels); StarScene.setConst(set.sky !== false);
  render({fly:true});
  setTimeout(function(){ $('loading').classList.add('hide'); firstVisit(); }, 250);
}).catch(function(err){
  console.error(err);
  $('loadMsg').textContent = '3D 地圖載入失敗（可能是網路無法連到繪圖元件）';
  $('loadSub').textContent = '月相、暗夜時數與觀星點清單仍可使用，點畫面任一處繼續。';
  $('loading').addEventListener('click', function(){ $('loading').classList.add('hide'); firstVisit(); }, {once:true});
});

window.__star = {logs:logs, openLog:openLog, renderPass:renderPass, BADGES:BADGES, setSkyIdx:setSkyIdx, skyNow:skyNow, toggleLook:toggleLook, fcFetch:fcFetch, fc:function(){ return {state:fcState, data:fcData}; }, planetBox:planetBox, spotCands:spotCands, shareUrl:shareUrl, shareText:shareText, buildIcs:buildIcs, toast:toast, state:st, setDate:setDate, shiftDay:shiftDay, selectSpot:selectSpot, selectRegion:selectRegion, setLayer:setLayer, nextGood:nextGood, SM:SM, AS:AS, scene:StarScene};
})();

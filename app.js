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

var set = Object.assign({date:'today', labels:true, layer:true, motion:'auto', theme:'auto', play:900}, lsGet(SET_KEY, {}));
var pref = lsGet(PREF_KEY, {});
var t0 = tonight();
var st = {y:t0.y, m:t0.m, d:t0.d, region:SM.regionById[pref.region] ? pref.region : 'all', spot:SM.spotById[pref.spot] ? pref.spot : null, layer:set.layer !== false};
if (set.date === 'last' && pref.y){ st.y = pref.y; st.m = pref.m; st.d = pref.d; }
if (st.spot) st.region = SM.spotById[st.spot].r;
function save(){ lsSet(PREF_KEY, {y:st.y, m:st.m, d:st.d, region:st.region, spot:st.spot}); }
function reduceOn(){ return set.motion === 'reduce' || (set.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function applyTheme(){ if (set.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', set.theme); }
applyTheme();

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
  return '<button type="button" class="scard" data-spot="' + p.id + '"><b>' + SM.TYPES[p.type].icon + ' ' + esc(p.name) + '</b>' + scoreChip(r.score) +
    '<small>' + (certShort(p) ? '<span class="cert">★ ' + certShort(p) + '</span> ' : '') + esc(p.city.replace(/（.*）/, '')) + '・海拔約 ' + p.elev.toLocaleString() + ' m・光害' + SM.LP[p.lp].name +
    (r.why.length ? '｜' + r.why.join('、') : '') + (h.length ? '<br>' + h.map(function(x){ return x[1] + ' ' + esc(x[2]); }).join('　') : '') + '</small></button>';
}
function nightBox(n){
  var tl = function(ms){ return ms ? AS.hm(ms) : '—'; };
  var mr = n.mrise ? AS.hm(n.mrise) : '（白天已升起）', ms = n.mset ? AS.hm(n.mset) : '（隔天中午後）';
  return '<div class="nbox"><div class="mbig">' + AS.moonSvg(n.illum, n.waxing, 46) + '<div><b>' + n.phase + '</b><small>月齡 ' + n.age.toFixed(1) + '・亮 ' + Math.round(n.illum * 100) + '%</small></div></div>' +
    '<dl><dt>天黑（天文昏影終）</dt><dd>' + tl(n.dusk) + '</dd><dt>天亮（天文晨光始）</dt><dd>' + tl(n.dawn) + '</dd>' +
    '<dt>月出／月落</dt><dd>' + mr + '／' + ms + '</dd>' +
    '<dt>無月暗夜</dt><dd><b>' + fmtH(n.darkH) + ' 小時</b>' + (n.darkFrom ? '（' + AS.hm(n.darkFrom) + '～' + AS.hm(n.darkTo) + '）' : '') + '</dd>' +
    '<dt>銀河核心</dt><dd>' + (n.gcH > 0 ? '<b>' + fmtH(n.gcH) + ' 小時</b>（' + AS.hm(n.gcFrom) + '～' + AS.hm(n.gcTo) + '，南方）' : '暗夜時段看不到') + '</dd></dl></div>';
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
    cells += '<button type="button" class="yc s' + r.score + (k === 0 ? ' on' : '') + '" data-ymd="' + q.join('-') + '" title="' + q[1] + '/' + q[2] + '：' + SM.SCORES[r.score].name + '，無月暗夜 ' + fmtH(n.darkH) + ' 小時">' + AS.moonSvg(n.illum, n.waxing, 12) + '<span>' + q[2] + '</span></button>';
  }
  return '<div class="ystrip" aria-label="未來兩週觀星指數">' + cells + '</div>';
}
function render(opts){
  opts = opts || {};
  var y = st.y, m = st.m, d = st.d, sp = st.spot ? SM.spotById[st.spot] : null, n = AS.night(y, m, d);
  $('dateBig').innerHTML = m + '/' + d + '<small>（' + wday(y, m, d) + '）</small>';
  $('dateSub').textContent = y + ' 年・' + n.phase;
  $('moonNow').innerHTML = AS.moonSvg(n.illum, n.waxing, 34);
  renderAxis();
  $('btnLayer').classList.toggle('on', st.layer);
  var place = $('place'), list = $('list'), scope = spotsInScope();
  var good = scope.filter(function(p){ return SM.score(p, y, m, d).score >= 4; }).length;
  if (sp){
    var r = SM.score(sp, y, m, d), ns = r.night, h = hlNow(sp, m), gear = SM.gear(sp, r);
    place.innerHTML = '<h2>' + esc(sp.name) + '<small>' + esc(sp.city) + '</small></h2>' +
      '<div class="meta">' + scoreChip(r.score, '（' + m + '/' + d + '）') + lpChip(sp.lp) + '<span>' + SM.TYPES[sp.type].icon + ' ' + SM.TYPES[sp.type].name + '</span><span>海拔約 ' + sp.elev.toLocaleString() + ' m</span></div>' +
      (sp.cert ? '<div class="certbox">★ ' + esc(sp.cert) + '</div>' : '') +
      nightBox(ns) + showerBox() +
      '<div class="wxrow"><span class="clr">晴夜機會（' + m + '月粗估）：' + (r.clear >= .85 ? '高' : r.clear >= .6 ? '中' : '低') + '</span>' + wxChips(r.wx) + '</div>' +
      '<div class="sublbl">未來兩週</div>' + weekStrip(sp) +
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
    place.innerHTML = '<h2>' + m + '/' + d + ' 的夜空<small>' + (rg ? rg.name + '・' : '全台灣・') + scope.length + ' 個觀星點</small></h2>' + nightBox(n) + showerBox() +
      '<p>' + (good ? '今晚有 <b>' + good + '</b> 個觀星點指數 4 以上，最推薦：<button type="button" class="lnk" data-spot="' + best.id + '">' + esc(best.name) + '</button>。' : n.darkH < 2 ? '月光很亮，適合賞月、看亮星與行星；想看銀河請挑新月前後。' : '條件普通，挑光害少、天氣好的地方。') +
      (st.layer ? '地圖上橘黃色的光暈是城市光害（示意）。' : '') + '時間以台灣中部估算，各地相差幾分鐘。</p>';
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
    StarScene.setDate(y, m, d); StarScene.selectSpot(st.spot); StarScene.setLayer(st.layer);
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

/* ---------- 常用設定（收合式） ---------- */
function fillSettings(){
  $('setDate').value = set.date; $('setLayer').checked = set.layer !== false; $('setLabels').checked = !!set.labels; $('setMotion').value = set.motion; $('setTheme').value = set.theme; $('setPlay').value = String(set.play);
  var txt = function(id){ var s = $(id); return s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : ''; };
  $('sv-date').textContent = txt('setDate'); $('sv-layer').textContent = set.layer !== false ? '開' : '關'; $('sv-labels').textContent = set.labels ? '顯示' : '隱藏';
  $('sv-motion').textContent = txt('setMotion'); $('sv-play').textContent = txt('setPlay').replace(/（.*/, ''); $('sv-theme').textContent = txt('setTheme');
  var open = lsGet(SEC_KEY, []);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.open = open.indexOf(d.dataset.sec) >= 0; });
}
function saveSettings(){
  set = {date:$('setDate').value, layer:$('setLayer').checked, labels:$('setLabels').checked, motion:$('setMotion').value, theme:$('setTheme').value, play:+$('setPlay').value};
  lsSet(SET_KEY, set); applyTheme();
  if (window.StarScene && StarScene.ready){ StarScene.setLabels(set.labels); StarScene.setReduce(reduceOn()); }
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
  $('selRegion').addEventListener('change', function(){ selectRegion(this.value); });
  $('selSpot').addEventListener('change', function(){ if (this.value) selectSpot(this.value); else selectRegion(st.region); });
  $('list').addEventListener('click', function(e){ var c = e.target.closest('.scard'); if (c) selectSpot(c.dataset.spot); });
  $('place').addEventListener('click', function(e){
    var y = e.target.closest('[data-ymd]'); if (y){ stopPlay(); var q = y.dataset.ymd.split('-').map(Number); setDate(q[0], q[1], q[2]); return; }
    var s = e.target.closest('[data-spot]'); if (s) selectSpot(s.dataset.spot);
  });
  $('btnAll').addEventListener('click', function(){ st.region = 'all'; st.spot = null; fillSelectors(); render({fly:true}); });
  $('btnAbout').addEventListener('click', function(){ openModal('about'); });
  ['btnEtq', 'btnEtq2', 'btnEtq3'].forEach(function(id){ $(id).addEventListener('click', function(){ if (id === 'btnEtq3') closeModal($('about')); openModal('etq'); }); });
  $('btnSet').addEventListener('click', function(){ fillSettings(); openModal('settings'); });
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
    var open = document.querySelector('.modal.show');
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
StarScene.onPickSpot = function(id){ selectSpot(id); };
function firstVisit(){ if (!lsGet(SEEN_KEY, 0)) openModal('about'); }
StarScene.init({host:$('stage'), labels:$('labels'), reduce:reduceOn(), date:{y:st.y, m:st.m, d:st.d}, layer:st.layer}).then(function(){
  StarScene.setLabels(set.labels);
  render({fly:true});
  setTimeout(function(){ $('loading').classList.add('hide'); firstVisit(); }, 250);
}).catch(function(err){
  console.error(err);
  $('loadMsg').textContent = '3D 地圖載入失敗（可能是網路無法連到繪圖元件）';
  $('loadSub').textContent = '月相、暗夜時數與觀星點清單仍可使用，點畫面任一處繼續。';
  $('loading').addEventListener('click', function(){ $('loading').classList.add('hide'); firstVisit(); }, {once:true});
});

window.__star = {state:st, setDate:setDate, shiftDay:shiftDay, selectSpot:selectSpot, selectRegion:selectRegion, setLayer:setLayer, nextGood:nextGood, SM:SM, AS:AS, scene:StarScene};
})();

/* ================= 台灣觀星地圖：天文計算 =================
 * 不依賴外部函式庫，用天文年鑑／Meeus《Astronomical Algorithms》的低精度公式：
 *   太陽位置（誤差約 0.01°）、月亮位置（黃經誤差約 0.3°，含視差修正）、恆星時、地平座標。
 * 月出月落、天文昏影的時間以每 5 分鐘取樣判斷，誤差約數分鐘，供觀星規劃參考，不是精密星曆。
 * 時間一律以台灣時間（UTC+8）表示。
 */
var AS = window.AS = {};
(function(){
'use strict';
var D2R = Math.PI / 180, R2D = 180 / Math.PI, TZ = 8;
function sin(d){ return Math.sin(d * D2R); } function cos(d){ return Math.cos(d * D2R); }
function norm(d){ d %= 360; return d < 0 ? d + 360 : d; }
function jd(ms){ return ms / 86400000 + 2440587.5; }

/* 太陽：黃經、赤經赤緯 */
function sun(J){
  var T = (J - 2451545) / 36525;
  var L0 = 280.46646 + 36000.76983 * T, M = 357.52911 + 35999.05029 * T;
  var C = (1.914602 - .004817 * T) * sin(M) + .019993 * sin(2 * M) + .000289 * sin(3 * M);
  var lam = L0 + C - .00569 - .00478 * sin(125.04 - 1934.136 * T);
  var eps = 23.439291 - .0130042 * T + .00256 * cos(125.04 - 1934.136 * T);
  return {lam:norm(lam), ra:norm(Math.atan2(cos(eps) * sin(lam), cos(lam)) * R2D), dec:Math.asin(sin(eps) * sin(lam)) * R2D};
}
/* 月亮：黃經、黃緯、地平視差 */
function moon(J){
  var T = (J - 2451545) / 36525;
  var lam = 218.32 + 481267.881 * T + 6.29 * sin(135.0 + 477198.87 * T) - 1.27 * sin(259.3 - 413335.36 * T) + .66 * sin(235.7 + 890534.22 * T)
    + .21 * sin(269.9 + 954397.74 * T) - .19 * sin(357.5 + 35999.05 * T) - .11 * sin(186.5 + 966404.03 * T);
  var bet = 5.13 * sin(93.3 + 483202.02 * T) + .28 * sin(228.2 + 960400.89 * T) - .28 * sin(318.3 + 6003.15 * T) - .17 * sin(217.6 - 407332.21 * T);
  var par = .9508 + .0518 * cos(135.0 + 477198.87 * T) + .0095 * cos(259.3 - 413335.36 * T) + .0078 * cos(235.7 + 890534.22 * T) + .0028 * cos(269.9 + 954397.74 * T);
  var eps = 23.439291 - .0130042 * T;
  lam = norm(lam);
  var ra = Math.atan2(sin(lam) * cos(eps) - Math.tan(bet * D2R) * sin(eps), cos(lam)) * R2D;
  var dec = Math.asin(sin(bet) * cos(eps) + cos(bet) * sin(eps) * sin(lam)) * R2D;
  return {lam:lam, bet:bet, par:par, ra:norm(ra), dec:dec};
}
function gmst(J){ var T = (J - 2451545) / 36525; return norm(280.46061837 + 360.98564736629 * (J - 2451545) + .000387933 * T * T); }
function alt(J, lat, lon, ra, dec){ var H = gmst(J) + lon - ra; return Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H)) * R2D; }
AS.alt = alt;
var GC = {ra:266.405, dec:-28.936};   // 銀河中心（人馬座 A*），J2000
AS.GC = GC;

/* 某一瞬間的月相 */
AS.moonPhase = function(ms){
  var J = jd(ms), s = sun(J), m = moon(J);
  var el = norm(m.lam - s.lam), psi = Math.acos(cos(m.bet) * cos(m.lam - s.lam)) * R2D;
  return {illum:(1 - cos(psi)) / 2, waxing:el < 180, age:el / 360 * 29.530589, elong:el};
};
var PHASE_NAMES = [['新月', 1], ['眉月', 6.4], ['上弦月', 8.9], ['盈凸月', 13.8], ['滿月', 15.8], ['虧凸月', 20.6], ['下弦月', 23.1], ['殘月', 28.5], ['新月', 30]];
AS.phaseName = function(age){ for (var i = 0; i < PHASE_NAMES.length; i++) if (age < PHASE_NAMES[i][1]) return PHASE_NAMES[i][0]; return '新月'; };

/* 台灣時間某天中午的毫秒值 */
function noonMs(y, m, d){ return Date.UTC(y, m - 1, d, 12 - TZ, 0, 0); }
AS.noonMs = noonMs;
function hm(ms){ var t = new Date(ms + TZ * 3600000); return ('0' + t.getUTCHours()).slice(-2) + ':' + ('0' + t.getUTCMinutes()).slice(-2); }
AS.hm = hm;

/* 某天晚上（當天中午到隔天中午）的觀星條件，地點預設台灣中部 */
var CACHE = {};
AS.night = function(y, m, d, lat, lon){
  lat = lat == null ? 23.7 : lat; lon = lon == null ? 121.0 : lon;
  var key = y + '-' + m + '-' + d + '@' + lat.toFixed(1) + ',' + lon.toFixed(1);
  if (CACHE[key]) return CACHE[key];
  var t0 = noonMs(y, m, d), STEP = 5 * 60000, N = 288;
  var dusk = null, dawn = null, mrise = null, mset = null, prevUp = null, dark = 0, gcDark = 0, gcFrom = null, gcTo = null, darkFrom = null, darkTo = null;
  var mid = AS.moonPhase(t0 + 12 * 3600000), SA = [], MA = [], GA = [];
  for (var i = 0; i <= N; i++){
    var ms = t0 + i * STEP, J = jd(ms), s = sun(J), mo = moon(J);
    var sa = alt(J, lat, lon, s.ra, s.dec);
    var ma = alt(J, lat, lon, mo.ra, mo.dec); ma -= mo.par * Math.cos(ma * D2R);      // 地心→站心
    var up = ma > -.6;
    if (prevUp !== null && up !== prevUp){ if (up && mrise === null) mrise = ms; if (!up && mset === null) mset = ms; }
    prevUp = up;
    var gaN = alt(J, lat, lon, GC.ra, GC.dec);
    SA.push(Math.round(sa * 10) / 10); MA.push(Math.round(ma * 10) / 10); GA.push(Math.round(gaN * 10) / 10);
    var astroDark = sa < -18;
    if (astroDark){ if (dusk === null) dusk = ms; dawn = ms; }
    var moonless = !up || mid.illum < .06;
    if (astroDark && moonless && i < N){
      dark += 5; if (darkFrom === null) darkFrom = ms; darkTo = ms + STEP;
      if (gaN > 10){ gcDark += 5; if (gcFrom === null) gcFrom = ms; gcTo = ms + STEP; }
    }
  }
  var r = {y:y, m:m, d:d, illum:mid.illum, waxing:mid.waxing, age:mid.age, phase:AS.phaseName(mid.age),
    dusk:dusk, dawn:dawn, nightH:dusk ? (dawn - dusk) / 3600000 : 0, mrise:mrise, mset:mset,
    darkH:dark / 60, darkFrom:darkFrom, darkTo:darkTo, gcH:gcDark / 60, gcFrom:gcFrom, gcTo:gcTo,
    t0:t0, step:STEP, samp:{sun:SA, moon:MA, gc:GA}};   // samp：當天中午起每 5 分鐘的太陽／月亮／銀河中心高度（度），給逐小時時間軸用
  CACHE[key] = r;
  return r;
};
AS.daysIn = function(y, m){ return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
AS.addDays = function(y, m, d, k){ var t = new Date(Date.UTC(y, m - 1, d + k)); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
AS.doy = function(y, m, d){ return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1; };

/* 月相小圖（SVG）：亮面依照明比例與盈虧畫 */
AS.moonSvg = function(illum, waxing, size){
  size = size || 18;
  var r = 8, k = 1 - 2 * illum, rx = Math.abs(k) * r;
  // 亮面：一半圓＋一個橢圓（凸月時加、眉月時減）
  var side = waxing ? 1 : 0, sweep2 = (k > 0) ? (waxing ? 0 : 1) : (waxing ? 1 : 0);
  var d = 'M10 2 A8 8 0 0 ' + side + ' 10 18 A' + rx.toFixed(2) + ' 8 0 0 ' + sweep2 + ' 10 2 Z';
  return '<svg class="mn" width="' + size + '" height="' + size + '" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" class="mn-d"/><path d="' + d + '" class="mn-l"/></svg>';
};
})();

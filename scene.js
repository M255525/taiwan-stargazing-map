/* ================= 台灣觀星地圖：3D 場景 =================
 * Three.js（importmap 指到 jsdelivr）。台灣本島與離島輪廓、山脈地形、離岸距離場沿用台灣賞鳥地圖的做法。
 * 整張地圖是夜景：月光照明（亮度依當晚月相）、陸地 shader 疊上城市光害光暈（「光害圖層」）、夜空是一顆依「日期＋時間＋觀星點緯度」
 * 轉動的天球（真實亮星、星座連線、沿銀道的銀河帶、月亮與行星在實際位置，地平線以下用裁切平面切掉），流星雨期間有流星劃過。
 * 每個觀星點放一座小平台：望遠鏡、腳架相機、觀星的人與紅光手電筒，暗空公園／暗空勝地插上認證小旗。
 * 座標：x = 東西、z = 南北（北為 -z）、y = 高度；1 單位約 10 公里，山高與景物大小都有誇大。
 * 本檔由 tools/build_scene.py 把賞花地圖 scene.js 的共用段落（地形、標籤、排列、雲、鏡頭、點選）組進來。
 */
(function(){
'use strict';
var S = window.StarScene = {ready:false};
var T, Orbit;
var EXT = {x0:-36, z0:-36, x1:18, z1:28}, RES = .25, FW = 0, FH = 0, FIELD = null;
var U = {time:{value:0}, layer:{value:1}, moon:{value:.5}, city:null};
var renderer, scene, camera, controls, raycaster, ndc, toonGrad, clock, seaMat, landMat;
var ISL = [], SPOT3 = {}, labels = [], clouds = [], pickables = [];
var selId = null, fly = null, showLabels = true, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
var cur = {y:2026, m:1, d:1}, NIGHT = null;
var host, labelRoot, tmpV, hemi, moonLight, amb, sky = {};
var TF = {ISLANDS:SM.ISLANDS, SPOTS:SM.SPOTS, PEAKS:SM.PEAKS};   // 共用段落沿用的名稱

function P(lon, lat){ return [(lon - 120.9) * 10.17, -(lat - 23.7) * 11.1]; }
S.proj = P;
function hash(n){ var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function smooth(a, b, x){ var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function col(h){ return new T.Color(h); }
function ease(t){ return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function noise(x, z){ return .5 * Math.sin(x * 1.9 + z * .7) * Math.sin(z * 1.4 - x * .5) + .3 * Math.sin(x * 4.1 + 1.3) * Math.sin(z * 3.7 + .4) + .2 * Math.sin(x * 8.3 + z * 6.1); }

/* ---------- 幾何：多邊形與距離場 ---------- */
function segD2(x, z, a, b){
  var dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, t = l ? ((x - a[0]) * dx + (z - a[1]) * dz) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  var px = a[0] + t * dx - x, pz = a[1] + t * dz - z; return px * px + pz * pz;
}
function inPoly(x, z, poly){
  var c = false;
  for (var i = 0, n = poly.length, j = n - 1; i < n; j = i++){
    var a = poly[i], b = poly[j];
    if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
  }
  return c;
}
function edgeDist(x, z, poly){
  var m = 1e9;
  for (var i = 0, n = poly.length, j = n - 1; i < n; j = i++){ var d = segD2(x, z, poly[j], poly[i]); if (d < m) m = d; }
  return Math.sqrt(m);
}
function sdIsland(x, z, I){ var d = edgeDist(x, z, I.poly); return inPoly(x, z, I.poly) ? -d : d; }
function sdAll(x, z){
  var best = 1e9;
  for (var k = 0; k < ISL.length; k++){
    var bb = ISL[k].bb, bx = Math.max(bb[0] - x, 0, x - bb[2]), bz = Math.max(bb[1] - z, 0, z - bb[3]);
    if (bx * bx + bz * bz > best * best) continue;
    var d = sdIsland(x, z, ISL[k]);
    if (d < best) best = d;
    if (best < 0) return best;
  }
  return best;
}
function field(x, z){
  var fx = (x - EXT.x0) / RES, fz = (z - EXT.z0) / RES;
  if (fx < 0 || fz < 0 || fx >= FW - 1 || fz >= FH - 1) return 12;
  var i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * FW + i;
  return (FIELD[k] * (1 - u) + FIELD[k + 1] * u) * (1 - v) + (FIELD[k + FW] * (1 - u) + FIELD[k + FW + 1] * u) * v;
}
S.field = field;

var HGT = {penghu:.12, baisha:.1, xiyu:.12, kinmen:.26, lieyu:.2, nangan:.38, beigan:.4, dongyin:.3, juguang:.25,
  qimei:.14, wangan:.12, ludao:.34, lanyu:.62, liuqiu:.16, guishan:.55, keelungi:.22};
function buildPolys(){
  TF.ISLANDS.forEach(function(I, k){
    var poly;
    if (I.poly) poly = I.poly.map(function(p){ return P(p[0], p[1]); });
    else {
      var c = P(I.c[0], I.c[1]), r = I.km / 10 * 1.5, sx = I.sx || 1, sy = I.sy || 1;
      poly = [];
      for (var i = 0; i < 24; i++){
        var a = i / 24 * Math.PI * 2, rr = r * (1 + .1 * Math.sin(3 * a + k) + .06 * Math.sin(5 * a + k * 2));
        poly.push([c[0] + Math.cos(a) * rr * sx, c[1] + Math.sin(a) * rr * sy]);
      }
    }
    var bb = [1e9, 1e9, -1e9, -1e9], cx = 0, cz = 0;
    poly.forEach(function(p){ bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); cx += p[0]; cz += p[1]; });
    ISL.push({id:I.id, name:I.name, main:!!I.main, poly:poly, bb:bb, hgt:HGT[I.id] || .2, c:[cx / poly.length, cz / poly.length]});
  });
}
function buildField(){
  FW = Math.ceil((EXT.x1 - EXT.x0) / RES) + 1; FH = Math.ceil((EXT.z1 - EXT.z0) / RES) + 1;
  FIELD = new Float32Array(FW * FH);
  for (var j = 0; j < FH; j++) for (var i = 0; i < FW; i++) FIELD[j * FW + i] = sdAll(EXT.x0 + i * RES, EXT.z0 + j * RES);
  var data = new Uint8Array(FW * FH * 4);
  for (var k = 0; k < FW * FH; k++){ var d = Math.max(0, Math.min(12, FIELD[k])); data[k * 4] = Math.round(d / 12 * 255); data[k * 4 + 3] = 255; }
  var tex = new T.DataTexture(data, FW, FH, T.RGBAFormat);
  tex.magFilter = tex.minFilter = T.LinearFilter; tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping; tex.needsUpdate = true;
  return tex;
}

/* ---------- 地形 ---------- */
var RIDGES = [
  [[121.70,24.80,.6,1.2],[121.45,24.55,2.4,1.8],[121.30,24.30,3.5,2.0],[121.28,24.12,3.4,2.0],[121.22,23.85,3.3,2.1],[121.08,23.50,3.4,2.2],[121.00,23.20,3.0,2.0],[120.88,22.85,2.8,1.8],[120.78,22.55,2.7,1.6],[120.80,22.25,1.4,1.3],[120.83,22.00,.4,.8]],
  [[120.82,23.80,2.0,1.3],[120.957,23.47,3.95,1.3],[120.86,23.15,2.4,1.2]],
  [[121.55,24.72,1.6,1.3],[121.231,24.383,3.9,1.4],[121.02,24.20,2.6,1.3],[120.86,24.00,1.4,1.1]],
  [[121.53,23.78,.9,.6],[121.45,23.45,1.6,.6],[121.35,23.15,1.4,.6],[121.22,22.93,.9,.5]],
  [[121.50,25.20,.6,.6],[121.548,25.171,1.12,.7],[121.62,25.14,.7,.6]],
  [[120.62,23.30,.7,1.0],[120.72,23.65,.9,1.0],[120.80,24.35,.8,1.2]]
];
var KM = .42, RID = [];
function prepRidges(){ RID = RIDGES.map(function(r){ return r.map(function(p){ var q = P(p[0], p[1]); return [q[0], q[1], p[2] * KM, p[3]]; }); }); }
function ridgeH(x, z){
  var best = 0;
  RID.forEach(function(r){
    for (var i = 0; i < r.length - 1; i++){
      var a = r[i], b = r[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
      var t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l));
      var px = a[0] + t * dx - x, pz = a[1] + t * dz - z, d = Math.sqrt(px * px + pz * pz);
      var h = a[2] + (b[2] - a[2]) * t, w = a[3] + (b[3] - a[3]) * t;
      var v = h * Math.exp(-(d / w) * (d / w));
      if (v > best) best = v;
    }
  });
  return best;
}
var LANDC;
function landColor(h, d){
  if (h < -.01) return LANDC.under;
  if (d < .09 || h < .058) return LANDC.sand;
  if (h < .3) return LANDC.plain;
  if (h < .65) return LANDC.grass;
  if (h < 1.05) return LANDC.forest;
  if (h < 1.45) return LANDC.deep;
  if (h < 1.72) return LANDC.rock;
  return LANDC.peak;
}
function hAt(I, x, z, d){
  if (d <= 0) return Math.max(-.62, d * .9);
  var n = noise(x, z);
  if (I.main) return .05 + ridgeH(x, z) * smooth(0, 1.1, d) * (1 + .28 * n) + .03 * smooth(0, .5, d) * (n + 1);
  return .04 + I.hgt * smooth(0, Math.min(I.bb[2] - I.bb[0], I.bb[3] - I.bb[1]) * .4, d) * (1 + .2 * n);
}
function buildLand(I){
  var m = I.main ? 1.1 : .8, w = I.bb[2] - I.bb[0], res = I.main ? .12 : (w < 1 ? .05 : .08);
  var x0 = I.bb[0] - m, z0 = I.bb[1] - m, nx = Math.ceil((w + 2 * m) / res) + 1, nz = Math.ceil((I.bb[3] - I.bb[1] + 2 * m) / res) + 1;
  var pos = new Float32Array(nx * nz * 3), cols = new Float32Array(nx * nz * 3), hs = new Float32Array(nx * nz);
  for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++){
    var x = x0 + i * res, z = z0 + j * res, d = -sdIsland(x, z, I), k = j * nx + i, h = hAt(I, x, z, d);
    hs[k] = h; pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    var c = landColor(h, d); cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
  }
  var idx = [];
  for (j = 0; j < nz - 1; j++) for (i = 0; i < nx - 1; i++){
    var a = j * nx + i, b = a + 1, c2 = a + nx, d2 = c2 + 1;
    if (hs[a] > -.6 || hs[b] > -.6 || hs[c2] > -.6 || hs[d2] > -.6) idx.push(a, c2, b, b, c2, d2);
  }
  var g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('color', new T.BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  scene.add(new T.Mesh(g, landMat));
}
function landY(x, z){
  var best = null, bd = 1e9;
  ISL.forEach(function(I){ var d = sdIsland(x, z, I); if (d < bd){ bd = d; best = I; } });
  if (!best || bd > 0) return .05;
  return Math.max(.04, hAt(best, x, z, -bd));
}
S.landY = landY;

/* ---------- 夜景陸地＋光害光暈 ---------- */
var NC = SM.CITIES.length;
function nightPatch(mat){
  mat.onBeforeCompile = function(sh){
    sh.uniforms.uCity = {value:U.city}; sh.uniforms.uLayer = U.layer; sh.uniforms.uMoon = U.moon;
    sh.vertexShader = 'varying vec3 vP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    sh.fragmentShader = '#define NC ' + NC + '\nuniform vec3 uCity[NC]; uniform float uLayer, uMoon; varying vec3 vP;\n' +
      sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + [
      'float hk = max(0., vP.y) / ' + KM.toFixed(3) + ';',
      'float land = smoothstep(.03, .07, vP.y);',
      'float g = 0.;',
      'for (int i = 0; i < NC; i++){ vec2 d = vP.xz - uCity[i].xy; g += uCity[i].z * exp(-dot(d, d) / 5.5); }',
      'g *= 1. - smoothstep(.6, 2.6, hk) * .85;',                   // 高山上光害少
      'vec3 c = diffuseColor.rgb;',
      'vec3 glow = mix(vec3(1., .62, .25), vec3(1., .88, .55), smoothstep(.6, 1.4, g));',
      'c = mix(c, glow, clamp(g, 0., 1.) * uLayer * land * .8);',
      // 等高細線（星圖格線的感覺）
      'float cl = hk * 2.; float fw = fwidth(cl) + 1e-4;',
      'float ln = 1. - smoothstep(0., fw * 1.2, abs(fract(cl - .5) - .5));',
      'c = mix(c, c * 1.35 + vec3(.03, .04, .08), ln * land * step(.25, hk) * (1. - smoothstep(.12, .35, fw)) * .6);',
      'diffuseColor.rgb = c;'].join('\n'));
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' +
      '{ float g2 = 0.; for (int i = 0; i < NC; i++){ vec2 d = vP.xz - uCity[i].xy; g2 += uCity[i].z * exp(-dot(d, d) / 1.2); } totalEmissiveRadiance += vec3(1., .7, .35) * clamp(g2, 0., 1.2) * .55 * uLayer * smoothstep(.03, .07, vP.y); }');
  };
  mat.customProgramCacheKey = function(){ return 'starnight' + NC; };
  return mat;
}

/* ---------- 夜海 ---------- */
var SEA_VS = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
var SEA_FS = [
  'uniform sampler2D uDist; uniform vec4 uExt; uniform float uTime, uCalm, uMoon; uniform vec3 uHorizon; varying vec3 vW;',
  'void main(){',
  '  vec2 uv = (vW.xz - uExt.xy) / uExt.zw;',
  '  float d = texture2D(uDist, uv).r * 12.;',
  '  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) d = 12.;',
  '  vec3 col = mix(vec3(.12,.24,.33), vec3(.06,.14,.24), smoothstep(.1, 2., d));',
  '  col = mix(col, vec3(.03,.07,.15), smoothstep(2., 9., d));',
  '  float t = uTime * uCalm;',
  '  float f = 1. - smoothstep(.04, .14 + .04 * sin(t*2. + vW.x*5. + vW.z*3.), d);',
  '  col = mix(col, vec3(.55,.62,.75), f * (.25 + uMoon * .4));',
  '  float glint = pow(max(0., sin(vW.x * 2.1 + t * .7) * sin(vW.z * 1.7 - t * .5)), 18.) * uMoon * .35;',
  '  col += vec3(.75, .8, .9) * glint * smoothstep(1., 6., d);',
  '  col *= .75 + uMoon * .4;',
  '  float alpha = mix(.7, .92, smoothstep(0., 4., d));',
  '  float hz = smoothstep(60., 200., length(vW.xz - cameraPosition.xz));',
  '  col = mix(col, uHorizon, hz); alpha = mix(alpha, 1., hz);',
  '  gl_FragColor = vec4(col, alpha);',
  '}'].join('\n');
var BED_FS = [
  'uniform sampler2D uDist; uniform vec4 uExt; uniform vec3 uHorizon; varying vec3 vW;',
  'void main(){',
  '  vec2 uv = (vW.xz - uExt.xy) / uExt.zw; float d = texture2D(uDist, uv).r * 12.;',
  '  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) d = 12.;',
  '  vec3 col = mix(vec3(.1,.2,.24), vec3(.04,.1,.18), smoothstep(.2, 1.6, d));',
  '  col = mix(col, vec3(.02,.05,.1), smoothstep(2., 6., d));',
  '  float hz = smoothstep(60., 200., length(vW.xz - cameraPosition.xz)); col = mix(col, uHorizon, hz);',
  '  gl_FragColor = vec4(col, 1.);',
  '}'].join('\n');
function buildSea(tex){
  var uni = {uDist:{value:tex}, uExt:{value:new T.Vector4(EXT.x0, EXT.z0, (FW - 1) * RES, (FH - 1) * RES)},
    uTime:U.time, uMoon:U.moon, uCalm:{value:reduce ? .15 : 1}, uHorizon:{value:new T.Vector3(.08, .11, .22)}};
  seaMat = new T.ShaderMaterial({uniforms:uni, vertexShader:SEA_VS, fragmentShader:SEA_FS, transparent:true});
  var sea = new T.Mesh(new T.PlaneGeometry(520, 520), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(-8, 0, -4); sea.renderOrder = 2; scene.add(sea);
  var bed = new T.Mesh(new T.PlaneGeometry(520, 520), new T.ShaderMaterial({uniforms:{uDist:uni.uDist, uExt:uni.uExt, uHorizon:uni.uHorizon}, vertexShader:SEA_VS, fragmentShader:BED_FS}));
  bed.rotation.x = -Math.PI / 2; bed.position.set(-8, -.62, -4); scene.add(bed);
}

/* ---------- 觀星平台 ---------- */
var MC = {}, GC = {};
function M(c){ return MC[c] || (MC[c] = new T.MeshToonMaterial({color:c, gradientMap:toonGrad})); }
function box(w, h, d){ var k = 'b' + w + '_' + h + '_' + d; return GC[k] || (GC[k] = new T.BoxGeometry(w, h, d)); }
function cyl(r0, r1, h, n){ var k = 'c' + r0 + '_' + r1 + '_' + h + '_' + (n || 8); return GC[k] || (GC[k] = new T.CylinderGeometry(r0, r1, h, n || 8)); }
function cone(r, h, n){ var k = 'k' + r + '_' + h + '_' + (n || 7); return GC[k] || (GC[k] = new T.ConeGeometry(r, h, n || 7)); }
function ball(r, d){ var k = 's' + r + '_' + (d || 1); return GC[k] || (GC[k] = new T.IcosahedronGeometry(r, d || 1)); }
function mesh(g, c, x, y, z, ry){ var m = new T.Mesh(g, typeof c === 'string' ? M(c) : c); m.position.set(x || 0, y || 0, z || 0); if (ry) m.rotation.y = ry; return m; }
function disc(r, c, x, z, y){ var g = GC['d' + r] || (GC['d' + r] = new T.CircleGeometry(r, 28)); var m = new T.Mesh(g, typeof c === 'string' ? M(c) : c); m.rotation.x = -Math.PI / 2; m.position.set(x || 0, y || .006, z || 0); return m; }
var RED = null;
function tripod(h){ var g = new T.Group(); [0, 2.1, 4.2].forEach(function(a){ var l = mesh(cyl(.0018, .0018, h, 4), '#2a2f3a', Math.cos(a) * .012, h / 2, Math.sin(a) * .012); l.rotation.z = Math.cos(a) * .25; l.rotation.x = -Math.sin(a) * .25; g.add(l); }); return g; }
function telescope(){
  var g = tripod(.05);
  var tube = mesh(cyl(.011, .011, .07, 12), '#e8e4da', 0, .065, 0); tube.rotation.z = -.9; g.add(tube);
  g.add(mesh(cyl(.012, .012, .006, 12), '#2a2f3a', .03, .086, 0)).rotation.z = -.9;
  return g;
}
function camera3(){ var g = tripod(.04); g.add(mesh(box(.016, .011, .01), '#1e2230', 0, .047, 0)); var l = mesh(cyl(.005, .005, .01, 8), '#1e2230', .0, .05, .009); l.rotation.x = Math.PI / 2 - .6; g.add(l); return g; }
function person(c, sit){
  var g = new T.Group();
  g.add(mesh(cyl(.007, .009, sit ? .016 : .024, 6), c, 0, sit ? .01 : .016)); g.add(mesh(ball(.0068, 1), '#e9c7a2', 0, sit ? .024 : .034));
  if (!RED) RED = new T.MeshBasicMaterial({color:'#ff3b30'});
  var lamp = new T.Mesh(ball(.0035, 0), RED); lamp.position.set(.008, sit ? .016 : .022, .006); g.add(lamp);
  return g;
}
function pine(s){ var g = new T.Group(); s = s || 1; g.add(mesh(cyl(.004 * s, .006 * s, .03 * s, 5), '#3a2c22', 0, .015 * s)); g.add(mesh(cone(.032 * s, .075 * s), '#1f3a36', 0, .06 * s)); g.add(mesh(cone(.023 * s, .055 * s), '#24433d', 0, .088 * s)); return g; }
var PERSON_C = ['#4a5a8a', '#8a4a5a', '#5a7a5a', '#7a6a4a'];
function buildSpot(p, i){
  var g = new T.Group(), R = .2;
  var pad = disc(R, p.type === 'coast' || p.type === 'island' ? '#3f4a3e' : p.type === 'plain' ? '#3a4f33' : '#2f4236', 0, 0, .004); g.add(pad);
  var ts = telescope(); ts.position.set(-.04, 0, 0); ts.rotation.y = hash(i) * 6; g.add(ts);
  var cm = camera3(); cm.position.set(.07, 0, .04); cm.rotation.y = 1 + hash(i * 2) * 2; g.add(cm);
  var n = 2 + (p.lp <= 2 ? 1 : 0);
  for (var k = 0; k < n; k++){ var pr = person(PERSON_C[(i + k) % 4], k === 2); var a = k * 2.2 + hash(i + k); pr.position.set(Math.cos(a) * .07, 0, Math.sin(a) * .07); pr.rotation.y = -a; g.add(pr); }
  if (p.type === 'peak' || p.type === 'forest'){ for (k = 0; k < 7; k++){ var a2 = k / 7 * 6.28 + hash(i * 3 + k); if (Math.sin(a2) > .4) continue; var t = pine(.7 + hash(k + i) * .4); t.position.set(Math.cos(a2) * (R + .03), 0, Math.sin(a2) * (R + .03)); g.add(t); } }
  if (p.type === 'peak'){ g.add(mesh(cone(.05, .06, 6), '#4a4e58', .14, .03, -.1)); }
  if (p.cert && /暗空公園|暗空勝地/.test(p.cert.slice(0, 40))){
    g.add(mesh(cyl(.0016, .0016, .09, 4), '#c9c3b0', -.13, .045, -.06));
    var fl = mesh(box(.032, .02, .002), '#e8c35a', -.113, .08, -.06); g.add(fl); g.userData.flag = fl;
  }
  return g;
}

/* ---------- 標籤 ---------- */
function addLabel(el, pos, pri, kind, extra){
  el.classList.add('lab3d', 'off');
  labelRoot.appendChild(el);
  var L = Object.assign({el:el, pos:pos, pri:pri, kind:kind, w:0, h:0, active:true, off:true}, extra || {});
  labels.push(L);
  return L;
}
function layoutLabels(){
  var W = host.clientWidth, H = host.clientHeight, placed = [];
  var sorted = labels.slice().sort(function(a, b){ return (b.pri + (b.boost || 0)) - (a.pri + (a.boost || 0)); });
  for (var i = 0; i < sorted.length; i++){
    var L = sorted[i];
    if (!L.active || (L.kind === 'spot' && !showLabels && !L.boost)){ hide(L); continue; }
    tmpV.copy(L.pos).project(camera);
    if (tmpV.z > 1 || tmpV.z < -1){ hide(L); continue; }
    var x = (tmpV.x * .5 + .5) * W, y = (-tmpV.y * .5 + .5) * H;
    if (!L.w){ L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
    var r = [x - L.w / 2, y - L.h, x + L.w / 2, y];
    if (r[2] < 0 || r[0] > W || r[3] < 0 || r[1] > H){ hide(L); continue; }
    var hit = false;
    if (L.kind !== 'sea') for (var k = 0; k < placed.length; k++){ var q = placed[k]; if (r[0] < q[2] + 2 && r[2] > q[0] - 2 && r[1] < q[3] + 1 && r[3] > q[1] - 1){ hit = true; break; } }
    if (hit){ hide(L); continue; }
    if (L.kind !== 'sea') placed.push(r);
    L.el.style.transform = 'translate(' + Math.round(r[0]) + 'px,' + Math.round(r[1]) + 'px)';
    if (L.off){ L.el.classList.remove('off'); L.off = false; }
  }
  function hide(L){ if (!L.off){ L.el.classList.add('off'); L.off = true; } }
}

/* ---------- 觀星點排列 ---------- */
function onLand(x, z){
  if (field(x, z) < -.15) return [x, z];
  for (var r = .05; r < 2; r += .05) for (var a = 0; a < 16; a++){
    var px = x + Math.cos(a / 16 * Math.PI * 2) * r, pz = z + Math.sin(a / 16 * Math.PI * 2) * r;
    if (field(px, pz) < -.18) return [px, pz];
  }
  return [x, z];
}
function layoutSpots(){
  var pos = TF.SPOTS.map(function(p){ return P(p.at[0], p.at[1]); }), used = [], groups = [];
  TF.SPOTS.forEach(function(p, i){
    if (used[i]) return;
    var g = [i]; used[i] = 1;
    for (var k = i + 1; k < pos.length; k++) if (!used[k] && g.some(function(m){ return Math.hypot(pos[m][0] - pos[k][0], pos[m][1] - pos[k][1]) < .7; })){ g.push(k); used[k] = 1; }
    groups.push(g);
  });
  var out = [];
  groups.forEach(function(g){
    if (g.length === 1){ out[g[0]] = onLand(pos[g[0]][0], pos[g[0]][1]); return; }
    var cx = 0, cz = 0; g.forEach(function(m){ cx += pos[m][0]; cz += pos[m][1]; }); cx /= g.length; cz /= g.length;
    var R = .42 + g.length * .07;
    var ang = g.map(function(m){ return {m:m, a:Math.atan2(pos[m][1] - cz, pos[m][0] - cx)}; }).sort(function(p, q){ return p.a - q.a; });
    ang.forEach(function(o, i){
      var a = ang[0].a + i / ang.length * Math.PI * 2;
      out[o.m] = onLand(cx + Math.cos(a) * R, cz + Math.sin(a) * R);
    });
  });
  return out;
}

function buildSpots(){
  var places = layoutSpots();
  SM.SPOTS.forEach(function(p, i){
    var x = places[i][0], z = places[i][1], y = landY(x, z), grp = buildSpot(p, i), K = 1.6;
    grp.position.set(x, y, z); grp.scale.setScalar(K);
    grp.children.forEach(function(o){ o.position.y += (landY(x + o.position.x * K, z + o.position.z * K) - y) / K; });
    grp.traverse(function(o){ if (o.isMesh){ o.userData.spotId = p.id; pickables.push(o); } });
    scene.add(grp);
    var el = document.createElement('button'); el.type = 'button'; el.className = 'plab'; el.dataset.spot = p.id;
    el.innerHTML = '<i></i>' + p.name.replace(/（.*）/, '') + (p.cert && /暗空公園|暗空勝地/.test(p.cert.slice(0, 40)) ? '<em>★</em>' : '');
    el.addEventListener('click', function(e){ e.stopPropagation(); if (S.onPickSpot) S.onPickSpot(p.id); });
    SPOT3[p.id] = {id:p.id, idx:i, x:x, y:y, z:z, grp:grp, label:addLabel(el, new T.Vector3(x, y + .38, z), 3, 'spot')};
  });
}
S.spot3 = function(id){ return SPOT3[id]; };

/* ---------- 夜空：星星、銀河、月亮、流星 ---------- */
function dotTex(soft){
  var c = document.createElement('canvas'); c.width = c.height = 32;
  var x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(soft ? .2 : .35, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new T.CanvasTexture(c);
}
var SKY_R = 380, DEG = Math.PI / 180;
var skyT = {ms:null, lat:23.7, lon:121.0}, skyLabs = [], showConst = true, lookUp = false, skyInfo = {};
function dirOnSky(az, alt){ return new T.Vector3(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)); }
/* 天球：子物件放在赤道座標（J2000；x→春分點、y→赤經 90°、z→北天極），整組依地點緯度與恆星時轉成地平座標，並跟著鏡頭移動（等於無限遠） */
function eqVec(ra, dec, r){ ra *= DEG; dec *= DEG; return new T.Vector3(Math.cos(dec) * Math.cos(ra) * r, Math.cos(dec) * Math.sin(ra) * r, Math.sin(dec) * r); }
var GAL = [[-.0548755604, -.8734370902, -.4838350155], [.4941094279, -.4448296300, .7469822445], [-.8676661490, -.1980763734, .4559837762]];
function galVec(l, b, r){
  l *= DEG; b *= DEG; var g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  return new T.Vector3((GAL[0][0] * g[0] + GAL[1][0] * g[1] + GAL[2][0] * g[2]) * r, (GAL[0][1] * g[0] + GAL[1][1] * g[1] + GAL[2][1] * g[2]) * r, (GAL[0][2] * g[0] + GAL[1][2] * g[1] + GAL[2][2] * g[2]) * r);
}
function skyMat(o){ o.transparent = true; o.depthWrite = false; o.fog = false; o.clippingPlanes = [sky.clip]; return o; }
function buildSky(){
  var i;
  sky.clip = new T.Plane(new T.Vector3(0, 1, 0), 0);   // 地平線以下切掉
  sky.cel = new T.Group(); sky.cel.renderOrder = -1; scene.add(sky.cel);
  /* 背景暗星：一半沿銀河盤面集中、一半均勻分布 */
  var n = 2600, pos = new Float32Array(n * 3), colr = new Float32Array(n * 3);
  for (i = 0; i < n; i++){
    var v = hash(i * 1.7) < .45 ? galVec(hash(i * 3.3 + 1) * 360, (hash(i * 5.1) + hash(i * 6.7) + hash(i * 8.9) - 1.5) * 22, SKY_R)
      : eqVec(hash(i * 3.3 + 1) * 360, Math.asin(hash(i * 2.9 + 7) * 2 - 1) / DEG, SKY_R);
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    var t = hash(i * 9.1); colr[i * 3] = t < .2 ? .75 : 1; colr[i * 3 + 1] = t < .2 ? .85 : t > .85 ? .85 : .97; colr[i * 3 + 2] = t > .85 ? .7 : 1;
  }
  var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(colr, 3));
  sky.stars = new T.Points(g, new T.PointsMaterial(skyMat({size:2, map:dotTex(), vertexColors:true, sizeAttenuation:false})));
  sky.stars.frustumCulled = false; sky.cel.add(sky.stars);
  var g2 = new T.BufferGeometry(), p2 = new Float32Array(260 * 3);
  for (i = 0; i < 260; i++){ var d2 = eqVec(hash(i * 5.3) * 360, Math.asin(hash(i * 7.7) * 2 - 1) / DEG, SKY_R); p2[i * 3] = d2.x; p2[i * 3 + 1] = d2.y; p2[i * 3 + 2] = d2.z; }
  g2.setAttribute('position', new T.BufferAttribute(p2, 3));
  sky.bright = new T.Points(g2, new T.PointsMaterial(skyMat({size:2.8, map:dotTex(), color:'#fffbe8', sizeAttenuation:false})));
  sky.bright.frustumCulled = false; sky.cel.add(sky.bright);
  /* 真實亮星：依星等分三組大小 */
  sky.cat = [[-9, .55, 7], [.55, 1.7, 5.2], [1.7, 9, 3.9]].map(function(bin){
    var list = SM.STARS.filter(function(s){ return s[4] >= bin[0] && s[4] < bin[1] && s[0] !== 'm31'; });
    var pp = new Float32Array(list.length * 3), cc = new Float32Array(list.length * 3);
    list.forEach(function(s, k){
      var v3 = eqVec(s[2], s[3], SKY_R * .998); pp[k * 3] = v3.x; pp[k * 3 + 1] = v3.y; pp[k * 3 + 2] = v3.z;
      var c3 = s[5] === 'r' ? [1, .62, .45] : s[5] === 'o' ? [1, .82, .6] : [.92, .96, 1]; cc[k * 3] = c3[0]; cc[k * 3 + 1] = c3[1]; cc[k * 3 + 2] = c3[2];
    });
    var gg = new T.BufferGeometry(); gg.setAttribute('position', new T.BufferAttribute(pp, 3)); gg.setAttribute('color', new T.BufferAttribute(cc, 3));
    var pts = new T.Points(gg, new T.PointsMaterial(skyMat({size:bin[2], map:dotTex(), vertexColors:true, sizeAttenuation:false})));
    pts.frustumCulled = false; sky.cel.add(pts); return pts;
  });
  /* 星座連線 */
  var lp = [], tp = [];
  SM.CONSTS.forEach(function(c){
    for (var k = 0; k < c.lines.length; k += 2){
      var a = SM.starById[c.lines[k]], b = SM.starById[c.lines[k + 1]], va = eqVec(a[2], a[3], SKY_R * .996), vb = eqVec(b[2], b[3], SKY_R * .996);
      // 兩星之間沿大圓插幾點，避免直線穿過天球內部
      for (var s = 0; s < 6; s++){
        var p0 = va.clone().lerp(vb, s / 6).setLength(SKY_R * .996), p1 = va.clone().lerp(vb, (s + 1) / 6).setLength(SKY_R * .996);
        (c.tri ? tp : lp).push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      }
    }
  });
  function lines(arr, color, op){
    var lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(new Float32Array(arr), 3));
    var L = new T.LineSegments(lg, new T.LineBasicMaterial(skyMat({color:color, opacity:op}))); L.frustumCulled = false; sky.cel.add(L); return L;
  }
  sky.constLines = [lines(lp, '#e6c36a', .38), lines(tp, '#8fb8ff', .28)];
  /* 銀河帶：canvas 長條貼在沿銀道的帶狀網格上（銀經 −180°～180°、銀緯 ±20°），中心在人馬座 */
  var W = 4096, HH = 512, Y0 = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = HH;   // 高 512px＝銀緯 ±20°，約 12.8px／度
  var cx2 = cv.getContext('2d'), rnd = function(k){ return hash(k * 7.13 + 2.1); };
  cx2.globalCompositeOperation = 'lighter';
  for (i = 0; i < 4200; i++){
    var x = rnd(i) * W, dx = Math.min(Math.abs(x - W / 2), W - Math.abs(x - W / 2)), core = Math.exp(-Math.pow(dx / 620, 2)), sp = 22 + core * 70;
    var yy = Y0 + (rnd(i + 999) + rnd(i + 555) - 1) * sp + Math.sin(x / 150) * 10, r = 14 + rnd(i + 77) * (18 + core * 44);
    var gg2 = cx2.createRadialGradient(x, yy, 0, x, yy, r), al = .018 + core * .05;
    gg2.addColorStop(0, 'rgba(' + Math.round(200 + core * 55) + ',' + Math.round(205 + core * 25) + ',' + Math.round(255 - core * 60) + ',' + al + ')'); gg2.addColorStop(1, 'rgba(0,0,0,0)');
    cx2.fillStyle = gg2; cx2.fillRect(x - r, yy - r, r * 2, r * 2);
  }
  cx2.globalCompositeOperation = 'destination-out';
  for (i = 0; i < 700; i++){   // 暗帶（大裂縫）在中心附近較明顯
    var x2 = W / 2 + (rnd(i + 3000) - .5) * W * .6, y2 = Y0 + Math.sin(x2 / 120) * 10 + (rnd(i + 3100) - .5) * 18, r2 = 8 + rnd(i + 3200) * 20;
    var g4 = cx2.createRadialGradient(x2, y2, 0, x2, y2, r2); g4.addColorStop(0, 'rgba(0,0,0,.32)'); g4.addColorStop(1, 'rgba(0,0,0,0)');
    cx2.fillStyle = g4; cx2.fillRect(x2 - r2, y2 - r2, r2 * 2, r2 * 2);
  }
  cx2.globalCompositeOperation = 'lighter';
  for (i = 0; i < 9000; i++){
    var x3 = rnd(i + 5000) * W, dx3 = Math.min(Math.abs(x3 - W / 2), W - Math.abs(x3 - W / 2)), c3 = Math.exp(-Math.pow(dx3 / 700, 2));
    var y3 = Y0 + (rnd(i + 6000) + rnd(i + 6500) + rnd(i + 7000) - 1.5) * (40 + c3 * 50);
    cx2.fillStyle = 'rgba(255,255,255,' + (.15 + rnd(i + 8000) * .5) * (.5 + c3 * .5) + ')'; cx2.beginPath(); cx2.arc(x3, y3, rnd(i + 9000) < .08 ? 1.6 : .9, 0, 6.29); cx2.fill();
  }
  var vfade = cx2.createLinearGradient(0, 0, 0, HH); vfade.addColorStop(0, 'rgba(0,0,0,1)'); vfade.addColorStop(.22, 'rgba(0,0,0,0)'); vfade.addColorStop(.78, 'rgba(0,0,0,0)'); vfade.addColorStop(1, 'rgba(0,0,0,1)');
  cx2.globalCompositeOperation = 'destination-out'; cx2.fillStyle = vfade; cx2.fillRect(0, 0, W, HH);
  var mwTex = new T.CanvasTexture(cv); mwTex.anisotropy = 4; mwTex.colorSpace = T.SRGBColorSpace;
  var NL = 180, NB = 8, mp = [], mu = [], mi = [];
  for (var bi = 0; bi <= NB; bi++) for (var li = 0; li <= NL; li++){
    var vv = galVec(-180 + li * 360 / NL, -20 + bi * 40 / NB, SKY_R * .99); mp.push(vv.x, vv.y, vv.z); mu.push(li / NL, bi / NB);
  }
  for (bi = 0; bi < NB; bi++) for (li = 0; li < NL; li++){ var q = bi * (NL + 1) + li; mi.push(q, q + 1, q + NL + 1, q + 1, q + NL + 2, q + NL + 1); }
  var mg = new T.BufferGeometry(); mg.setAttribute('position', new T.Float32BufferAttribute(mp, 3)); mg.setAttribute('uv', new T.Float32BufferAttribute(mu, 2)); mg.setIndex(mi);
  sky.mw = new T.Mesh(mg, new T.MeshBasicMaterial(skyMat({map:mwTex, opacity:.5, blending:T.AdditiveBlending, side:T.DoubleSide})));
  sky.mw.frustumCulled = false; sky.mw.renderOrder = -2; sky.cel.add(sky.mw);
  /* 月亮：canvas 依月相畫，放在月亮實際的赤經赤緯 */
  sky.moonCv = document.createElement('canvas'); sky.moonCv.width = sky.moonCv.height = 128;
  sky.moonTex = new T.CanvasTexture(sky.moonCv);
  sky.moon = new T.Sprite(new T.SpriteMaterial(skyMat({map:sky.moonTex})));
  sky.moon.scale.set(22, 22, 1); sky.cel.add(sky.moon);
  sky.halo = new T.Sprite(new T.SpriteMaterial(skyMat({map:dotTex(true), color:'#cfd8ff', opacity:.3, blending:T.AdditiveBlending})));
  sky.halo.scale.set(80, 80, 1); sky.cel.add(sky.halo);
  /* 行星 */
  sky.planets = {};
  AS.PLANETS.forEach(function(p){
    var sp2 = new T.Sprite(new T.SpriteMaterial(skyMat({map:dotTex(), color:p.c, blending:T.AdditiveBlending})));
    sky.cel.add(sp2); sky.planets[p.id] = sp2;
  });
  /* 天空文字：星座、亮星、行星 */
  function lab(text, cls, v){ var el = document.createElement('div'); el.className = 'skylab ' + cls; el.textContent = text; labelRoot.appendChild(el); var L = {el:el, v:v, on:false}; skyLabs.push(L); return L; }
  SM.CONSTS.forEach(function(c){
    var ids = c.lines.filter(function(x, k, a){ return a.indexOf(x) === k; }), m = new T.Vector3();
    ids.forEach(function(id){ var s = SM.starById[id]; m.add(eqVec(s[2], s[3], 1)); });
    lab(c.name, c.tri ? 'c tri' : 'c', m.setLength(SKY_R));
  });
  SM.STARS.forEach(function(s){ if (s[1]) lab(s[1], 's', eqVec(s[2], s[3], SKY_R)); });
  sky.plLabs = {};
  AS.PLANETS.forEach(function(p){ sky.plLabs[p.id] = lab(p.name, 'p', new T.Vector3()); });
  sky.moonLab = lab('月亮', 'p m', new T.Vector3());
  /* 流星（地平座標，不跟著天球轉） */
  sky.meteors = [];
  for (i = 0; i < 6; i++){
    var lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
    var ln = new T.Line(lg, new T.LineBasicMaterial({color:'#fff6d8', transparent:true, opacity:0, fog:false})); ln.frustumCulled = false; scene.add(ln);
    sky.meteors.push({l:ln, t:-1, a:null, b:null});
  }
}
/* 依時間與地點轉天球：地平座標 x＝東、y＝天頂、z＝南 */
var ROT = null;
function applySky(){
  if (!sky.cel || skyT.ms == null) return;
  var L = AS.lst(skyT.ms, skyT.lon) * DEG, f = skyT.lat * DEG, sL = Math.sin(L), cL = Math.cos(L), sf = Math.sin(f), cf = Math.cos(f);
  ROT = ROT || new T.Matrix4();
  ROT.set(-sL, cL, 0, 0,  cf * cL, cf * sL, sf, 0,  sf * cL, sf * sL, -cf, 0,  0, 0, 0, 1);
  sky.cel.setRotationFromMatrix(ROT);
  // 月亮與行星
  var me = AS.moonEq(skyT.ms); sky.moon.position.copy(eqVec(me.ra, me.dec, SKY_R * .95)); sky.halo.position.copy(sky.moon.position);
  sky.moonLab.v.copy(sky.moon.position);
  var moonDir = sky.moon.position.clone().applyMatrix4(ROT).normalize();
  skyInfo.moonAlt = Math.asin(moonDir.y) / DEG;
  AS.PLANETS.forEach(function(p){
    var pp = AS.planetPos(p.id, skyT.ms), spr = sky.planets[p.id], s = 4 + Math.max(0, 1.5 - pp.mag) * 2.2;
    spr.position.copy(eqVec(pp.ra, pp.dec, SKY_R * .97)); spr.scale.set(s, s, 1);
    spr.material.opacity = pp.elong < 12 ? 0 : 1;   // 太靠近太陽的看不到
    sky.plLabs[p.id].v.copy(spr.position); sky.plLabs[p.id].hide = pp.elong < 12;
  });
  var gc = eqVec(AS.GC.ra, AS.GC.dec, 1).applyMatrix4(ROT); skyInfo.gcAlt = Math.asin(gc.y) / DEG;
  // 天色：太陽越低，星星與銀河越清楚
  var sa = AS.sunAlt(skyT.ms, skyT.lat, skyT.lon); skyInfo.sunAlt = sa;
  skyInfo.tw = smooth(3, 16, -sa);
  applyNightLight();
}
/* 依天色、月亮是否在天上調整星空亮度與地面月光 */
function applyNightLight(){
  var n = NIGHT; if (!n || !sky.cel) return;
  var tw = skyInfo.tw == null ? 1 : skyInfo.tw, moonUp = skyInfo.moonAlt == null ? true : skyInfo.moonAlt > 0;
  var moonBright = n.illum * (moonUp ? 1 : .12);
  U.moon.value = .25 + moonBright * .75;
  hemi.intensity = .45 + moonBright * .7; moonLight.intensity = .25 + moonBright * 1.3; amb.intensity = .18 + moonBright * .2;
  var glare = 1 - moonBright * .55;   // 月光把暗星洗掉
  sky.stars.material.opacity = (.2 + .8 * glare) * (.12 + .88 * tw); sky.bright.material.opacity = (.45 + .55 * glare) * (.25 + .75 * tw);
  sky.cat.forEach(function(p){ p.material.opacity = .45 + .55 * tw; });
  sky.mw.material.opacity = .5 * glare * glare * tw;
  sky.constLines[0].material.opacity = .38 * (.4 + .6 * tw); sky.constLines[1].material.opacity = .28 * (.4 + .6 * tw);
  sky.moon.visible = sky.halo.visible = n.illum > .03;
  sky.halo.material.opacity = .08 + n.illum * .32;
  if (sky.moon.visible){ var md = sky.moon.position.clone().applyMatrix4(ROT || new T.Matrix4()); moonLight.position.copy(md.normalize().multiplyScalar(60)); if (md.y < 0) moonLight.position.y = 8; }
}
function layoutSky(){
  var show = showConst && controls.getPolarAngle() > 1.2, W = host.clientWidth, H = host.clientHeight, cp = camera.position, sinMin = Math.sin(3 * DEG);
  skyLabs.forEach(function(L){
    var on = false;
    if (show && !L.hide){
      tmpV.copy(L.v).applyMatrix4(ROT || new T.Matrix4());
      if (tmpV.y / SKY_R > sinMin){
        tmpV.add(cp).project(camera);
        if (tmpV.z < 1 && Math.abs(tmpV.x) < 1.05 && Math.abs(tmpV.y) < 1.05){
          on = true; L.el.style.transform = 'translate(' + ((tmpV.x + 1) / 2 * W).toFixed(1) + 'px,' + ((1 - tmpV.y) / 2 * H).toFixed(1) + 'px) translate(-50%,-50%)';
        }
      }
    }
    if (on !== L.on){ L.on = on; L.el.classList.toggle('on', on); }
  });
}
function drawMoon(illum, waxing){
  var c = sky.moonCv.getContext('2d'), R = 50, cx = 64, cy = 64;
  c.clearRect(0, 0, 128, 128);
  c.fillStyle = 'rgba(40,46,70,.55)'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.save(); c.beginPath();
  var k = 1 - 2 * illum, rx = Math.abs(k) * R, sgn = waxing ? 1 : -1;
  c.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, !waxing);
  c.ellipse(cx, cy, rx, R, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing ? true : false);
  c.closePath(); c.fillStyle = '#f4f1e6'; c.fill(); c.restore();
  c.fillStyle = 'rgba(160,160,150,.25)'; [[50, 50, 9], [76, 70, 7], [60, 82, 6], [80, 46, 5]].forEach(function(q){ c.beginPath(); c.arc(q[0], q[1], q[2], 0, Math.PI * 2); c.fill(); });
  sky.moonTex.needsUpdate = true;
}
function applyNight(){
  var n = NIGHT; if (!n) return;
  drawMoon(n.illum, n.waxing);
  sky.meteorRate = (SM.showersNear(cur.y, cur.m, cur.d)[0] || {zhr:0}).zhr;
  applyNightLight();
  if (sky.moonLab) sky.moonLab.hide = n.illum <= .03;
}
function updateMeteors(t, dt){
  if (!sky.meteors) return;
  var rate = sky.meteorRate ? Math.min(2.4, sky.meteorRate / 50) : .06;
  sky.meteors.forEach(function(me){
    if (me.t < 0){
      if (Math.random() < dt * rate * (reduce ? .2 : 1) / sky.meteors.length * 3){
        var az = Math.random() < .6 ? Math.PI + (Math.random() - .5) * 2.4 : Math.random() * 6.28, al = .15 + Math.random() * .75, a = dirOnSky(az, al).multiplyScalar(SKY_R * .95), dir = new T.Vector3(Math.random() - .5, -.6 - Math.random() * .4, Math.random() - .5).normalize().multiplyScalar(40 + Math.random() * 40);
        a.add(camera.position); me.a = a; me.b = a.clone().add(dir); me.t = 0;
      }
      return;
    }
    me.t += dt / .7;
    var arr = me.l.geometry.attributes.position.array, k = Math.min(1, me.t), h = Math.max(0, k - .35);
    var p1 = me.a.clone().lerp(me.b, h), p2 = me.a.clone().lerp(me.b, k);
    arr[0] = p1.x; arr[1] = p1.y; arr[2] = p1.z; arr[3] = p2.x; arr[4] = p2.y; arr[5] = p2.z;
    me.l.geometry.attributes.position.needsUpdate = true;
    me.l.material.opacity = Math.sin(Math.PI * Math.min(1, me.t)) * .95;
    if (me.t >= 1){ me.t = -1; me.l.material.opacity = 0; }
  });
}
function applyDate(){
  NIGHT = AS.night(cur.y, cur.m, cur.d);
  SM.CITIES.forEach(function(c, i){ var q = P(c[1], c[2]); U.city[i].set(q[0], q[1], c[3]); });
  SM.SPOTS.forEach(function(p){
    var S3 = SPOT3[p.id], r = SM.score(p, cur.y, cur.m, cur.d), sc = SM.SCORES[r.score];
    S3.label.el.querySelector('i').style.background = sc.c;
    S3.label.el.dataset.score = r.score;
    S3.label.pri = 2 + r.score * .4;
  });
  applyNight();
}

/* ---------- 雲 ---------- */
function cloud(seed){
  var g = new T.Group(), m = new T.MeshToonMaterial({color:'#ffffff', gradientMap:toonGrad, transparent:true, opacity:.95});
  var n = 4 + (seed % 3);
  for (var i = 0; i < n; i++){
    var r = .9 + hash(seed * 7 + i) * .9, s = new T.Mesh(new T.SphereGeometry(r, 12, 9), m);
    s.position.set((i - n / 2) * 1.1 + hash(seed + i) * .6, hash(seed * 3 + i) * .5, (hash(seed * 5 + i) - .5) * 1.4);
    s.scale.y = .62; g.add(s);
  }
  return g;
}

/* ---------- 鏡頭 ---------- */
S.flyTo = function(x, z, dist, polar, dur, y){
  var off = camera.position.clone().sub(controls.target), sph = new T.Spherical().setFromVector3(off);
  var to = new T.Spherical(dist, polar === undefined ? .9 : polar, sph.theta);
  var endT = new T.Vector3(x, y || 0, z), endP = new T.Vector3().setFromSpherical(to).add(endT);
  fly = {t0:clock.elapsedTime, dur:reduce ? .01 : (dur || 1.3), fromT:controls.target.clone(), toT:endT, fromP:camera.position.clone(), toP:endP};
};
function aspectK(){ var a = host.clientWidth / Math.max(1, host.clientHeight); return a < .8 ? 1.45 : 1; }
S.overview = function(){
  var a = host.clientWidth / Math.max(1, host.clientHeight);
  S.flyTo(-6, 0, a < .8 ? 100 : a < 1.2 ? 80 : 66, .6);
};
S.focusSpot = function(id){
  var S3 = SPOT3[id]; if (!S3) return;
  S.flyTo(S3.x, S3.z, (S3.y > .4 ? 5.6 : 5) * aspectK(), .9, 1.3, S3.y * .8);
};
S.focusRegion = function(ids){
  var xs = [], zs = [];
  ids.forEach(function(id){ var S3 = SPOT3[id]; if (S3){ xs.push(S3.x); zs.push(S3.z); } });
  if (!xs.length) return;
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
  S.flyTo((x0 + x1) / 2, (z0 + z1) / 2, Math.max(9, Math.max(x1 - x0, z1 - z0) * 1.5 + 6) * aspectK(), .8);
};

function endLookUp(){ lookUp = false; controls.maxPolarAngle = 1.5; }
S.overview = function(){
  endLookUp();
  var a = host.clientWidth / Math.max(1, host.clientHeight);
  S.flyTo(-6, 0, a < .8 ? 100 : a < 1.2 ? 80 : 66, .78);
  northUp();
};
/* 俯瞰全台、看整個地區時一律北方朝上（鏡頭在南邊往北看），不沿用觀星點「面向南方」的方位 */
function northUp(){ if (fly) fly.toP.copy(fly.toT).add(new T.Vector3().setFromSpherical(new T.Spherical(fly.toP.distanceTo(fly.toT), new T.Spherical().setFromVector3(fly.toP.clone().sub(fly.toT)).phi, 0))); }
var focusRegion0 = S.focusRegion;
S.focusRegion = function(ids){ endLookUp(); focusRegion0(ids); northUp(); };
S.focusSpot = function(id){
  var S3 = SPOT3[id]; if (!S3) return;
  endLookUp();
  S.flyTo(S3.x, S3.z, 3.2 * aspectK(), 1.42, 1.3, S3.y + .7);
  fly.toP.copy(fly.toT).add(new T.Vector3().setFromSpherical(new T.Spherical(3.2 * aspectK(), 1.42, Math.PI)));   // 從北往南看：銀河核心在南方
};
/* 仰望星空：鏡頭降到觀星點旁、往南方抬頭約 12°，可以拖曳環顧（地平線到仰角約 40°，往上拖可再抬頭） */
S.lookUp = function(on){
  var S3 = selId && SPOT3[selId];
  if (!S3 || !on){ if (lookUp && S3){ S.focusSpot(selId); } else endLookUp(); return false; }
  lookUp = true; controls.maxPolarAngle = 2.4;
  S.flyTo(S3.x, S3.z, 1.2, 1.78, 1.4, S3.y + 1.1);
  fly.toP.copy(fly.toT).add(new T.Vector3().setFromSpherical(new T.Spherical(1.2, 1.78, Math.PI)));
  return true;
};
S.isLookUp = function(){ return lookUp; };
/* 星空時間與地點（台灣時間毫秒、緯度、經度） */
S.setSky = function(ms, lat, lon){ skyT.ms = ms; if (lat != null){ skyT.lat = lat; skyT.lon = lon; } if (S.ready) applySky(); };
S.setConst = function(on){ showConst = !!on; if (sky.constLines) sky.constLines.forEach(function(L){ L.visible = showConst; }); };
/* ---------- 對外 ---------- */
S.setDate = function(y, m, d){ cur = {y:y, m:m, d:d}; if (S.ready) applyDate(); };
S.selectSpot = function(id){
  if (id !== selId && lookUp) endLookUp();
  if (selId && SPOT3[selId]){ SPOT3[selId].label.el.classList.remove('on'); SPOT3[selId].label.boost = 0; SPOT3[selId].label.w = 0; }
  selId = id || null;
  if (selId && SPOT3[selId]){ SPOT3[selId].label.el.classList.add('on'); SPOT3[selId].label.boost = 10; SPOT3[selId].label.w = 0; }
};
S.setLabels = function(on){ showLabels = !!on; };
S.setReduce = function(on){ reduce = !!on; if (seaMat) seaMat.uniforms.uCalm.value = reduce ? .15 : 1; };
S.setLayer = function(on){ U.layer.value = on ? 1 : 0; };
S.resize = function(){ if (S.ready) resize(); };

/* ---------- 互動 ---------- */
function pick(ev){
  var r = renderer.domElement.getBoundingClientRect();
  ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  var hit = raycaster.intersectObjects(pickables, false)[0];
  return hit ? hit.object.userData : null;
}
function bindPointer(){
  var el = renderer.domElement, down = null, q = null, pending = false;
  el.addEventListener('pointerdown', function(e){ down = {x:e.clientX, y:e.clientY}; });
  el.addEventListener('pointerup', function(e){
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    down = null;
    var u = pick(e); if (u && u.spotId && S.onPickSpot) S.onPickSpot(u.spotId);
  });
  el.addEventListener('pointermove', function(e){
    if (e.pointerType !== 'mouse') return;
    q = e; if (pending) return; pending = true;
    requestAnimationFrame(function(){ pending = false; el.style.cursor = pick(q) ? 'pointer' : ''; });
  });
}

/* ---------- 迴圈 ---------- */
function resize(){
  var w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h);
  if (w > 760) camera.setViewOffset(w, h, Math.min(190, w * .13), 0, w, h);
  else camera.setViewOffset(w, h, 0, document.body.classList.contains('sheet-min') ? -h * .09 : h * .1, w, h);
  camera.updateProjectionMatrix();
  labels.forEach(function(L){ L.w = 0; });
}
function loop(){
  requestAnimationFrame(loop);
  var dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
  U.time.value = t;
  if (fly){
    var k = Math.min(1, (t - fly.t0) / fly.dur), e = ease(k);
    controls.target.lerpVectors(fly.fromT, fly.toT, e); camera.position.lerpVectors(fly.fromP, fly.toP, e);
    if (k >= 1) fly = null;
  }
  controls.update();
  if (sky.cel){ sky.cel.position.copy(camera.position); sky.clip.constant = -camera.position.y; if (!reduce) sky.bright.material.size = 2.8 + Math.sin(t * 2.3) * .3; }
  SM.SPOTS.forEach(function(p){ var f = SPOT3[p.id].grp.userData.flag; if (f && !reduce) f.rotation.y = Math.sin(t * 3 + SPOT3[p.id].idx) * .3; });
  updateMeteors(t, dt);
  clouds.forEach(function(C){ C.g.position.x += dt * C.v * (reduce ? .3 : 1); if (C.g.position.x > EXT.x1 + 20) C.g.position.x = EXT.x0 - 20; });
  renderer.render(scene, camera);
  layoutLabels(); if (sky.cel) layoutSky();
}

/* ---------- 啟動 ---------- */
S.init = function(opts){
  host = opts.host; labelRoot = opts.labels;
  if (opts.reduce !== undefined) reduce = opts.reduce;
  if (opts.date) cur = opts.date;
  if (opts.layer !== undefined) U.layer.value = opts.layer ? 1 : 0;
  return Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]).then(function(mods){
    T = mods[0]; Orbit = mods[1].OrbitControls; tmpV = new T.Vector3();
    clock = new T.Clock();
    U.city = SM.CITIES.map(function(){ return new T.Vector3(); });
    LANDC = {under:col('#1d3a40'), sand:col('#3a4652'), plain:col('#2c4a3e'), grass:col('#27463b'), forest:col('#1f3d36'), deep:col('#1b3531'), rock:col('#3d4552'), peak:col('#59607a')};
    renderer = new T.WebGLRenderer({antialias:true, alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    host.appendChild(renderer.domElement);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(42, 1, .03, 900);
    camera.position.set(-6, 44, 34);
    controls = new Orbit(camera, renderer.domElement);
    controls.target.set(-6, 0, -3);
    controls.enableDamping = true; controls.dampingFactor = .08;
    controls.maxPolarAngle = 1.5; controls.minDistance = 1; controls.maxDistance = 140;
    controls.screenSpacePanning = false; controls.zoomSpeed = .9;
    controls.addEventListener('start', function(){ fly = null; });
    raycaster = new T.Raycaster(); ndc = new T.Vector2();
    toonGrad = new T.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, T.RedFormat);
    toonGrad.minFilter = toonGrad.magFilter = T.NearestFilter; toonGrad.needsUpdate = true;
    landMat = nightPatch(new T.MeshToonMaterial({vertexColors:true, gradientMap:toonGrad, emissive:new T.Color('#000000')}));
    hemi = new T.HemisphereLight('#8fa6e8', '#0e1626', .8); scene.add(hemi);
    moonLight = new T.DirectionalLight('#c9d6ff', .9); moonLight.position.set(-20, 40, 18); scene.add(moonLight);
    amb = new T.AmbientLight('#6070a0', .25); scene.add(amb);

    buildPolys(); prepRidges();
    var tex = buildField();
    buildSea(tex);
    ISL.forEach(buildLand);
    buildSpots(); buildSky();

    ISL.forEach(function(I){
      if (!I.name) return;
      var el = document.createElement('div'); el.className = I.main ? 'ilab main' : 'ilab'; el.textContent = I.name;
      var at = I.main ? new T.Vector3(1.5, 2.6, -2) : new T.Vector3(I.c[0], .5, I.c[1] - .2);
      addLabel(el, at, I.main ? 5 : 2, 'isle');
    });
    SM.PEAKS.forEach(function(pk){
      var q = P(pk.at[0], pk.at[1]), el = document.createElement('div'); el.className = 'pk';
      el.textContent = '▲ ' + pk.name + ' ' + pk.m.toLocaleString() + 'm';
      addLabel(el, new T.Vector3(q[0], landY(q[0], q[1]) + .25, q[1]), 1, 'peak');
    });
    [['台灣海峽', 119.6, 24.25], ['太平洋', 122.6, 23.3], ['巴士海峽', 120.6, 21.3]].forEach(function(s){
      var q = P(s[1], s[2]), el = document.createElement('div'); el.className = 'sealab'; el.textContent = s[0];
      addLabel(el, new T.Vector3(q[0], .1, q[1]), 0, 'sea');
    });
    for (var i = 0; i < 4; i++){
      var c = cloud(i + 1); c.position.set(EXT.x0 + hash(i * 3.3) * (EXT.x1 - EXT.x0 + 20), 13 + hash(i * 1.9) * 3, EXT.z0 + hash(i * 4.7) * (EXT.z1 - EXT.z0));
      c.scale.setScalar(.6 + hash(i * 2.2) * .5); c.children.forEach(function(s){ s.material.color.set('#3a4566'); s.material.opacity = .55; }); scene.add(c); clouds.push({g:c, v:.2 + hash(i) * .25});
    }

    bindPointer();
    window.addEventListener('resize', resize); resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    S.ready = true;
    applyDate(); applySky(); S.setConst(showConst);
    S.overview(); fly.dur = .01;
    loop();
  });
};
S.stats = function(){
  return {spots:Object.keys(SPOT3).length, islands:ISL.length, labels:labels.length, visibleLabels:labels.filter(function(L){ return !L.off; }).length,
    date:cur, illum:NIGHT ? +NIGHT.illum.toFixed(2) : null, darkH:NIGHT ? +NIGHT.darkH.toFixed(1) : null, gcH:NIGHT ? +NIGHT.gcH.toFixed(1) : null,
    mw:sky.mw ? +sky.mw.material.opacity.toFixed(2) : null, meteorRate:sky.meteorRate || 0, layer:U.layer.value,
    sky:{ms:skyT.ms, lat:skyT.lat, moonAlt:skyInfo.moonAlt, gcAlt:skyInfo.gcAlt, sunAlt:skyInfo.sunAlt, tw:skyInfo.tw, lookUp:lookUp, skyLabels:skyLabs.filter(function(L){ return L.on; }).map(function(L){ return L.el.textContent; })}};
};
})();

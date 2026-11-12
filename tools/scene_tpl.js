/* ================= 台灣觀星地圖：3D 場景 =================
 * Three.js（importmap 指到 jsdelivr）。台灣本島與離島輪廓、山脈地形、離岸距離場沿用台灣賞鳥地圖的做法。
 * 整張地圖是夜景：月光照明（亮度依當晚月相）、陸地 shader 疊上城市光害光暈（「光害圖層」）、夜空半球有星星、
 * 依當晚無月暗夜與銀河核心可見時數顯示銀河帶、依月相畫月亮，流星雨期間有流星劃過。
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

{{GEO}}
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

{{LABELS}}
{{LAYOUT}}
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
var SKY_R = 380;
function dirOnSky(az, alt){ return new T.Vector3(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)); }
function buildSky(){
  var n = 2600, pos = new Float32Array(n * 3), colr = new Float32Array(n * 3), i;
  for (i = 0; i < n; i++){
    var u = hash(i * 1.7), v = hash(i * 3.3 + 1), az = u * Math.PI * 2, al = Math.asin(.02 + v * .98);
    var d = dirOnSky(az, al).multiplyScalar(SKY_R); pos[i * 3] = d.x; pos[i * 3 + 1] = d.y * .7 + 6; pos[i * 3 + 2] = d.z;
    var t = hash(i * 9.1); colr[i * 3] = t < .2 ? .75 : 1; colr[i * 3 + 1] = t < .2 ? .85 : t > .85 ? .85 : .97; colr[i * 3 + 2] = t > .85 ? .7 : 1;
  }
  var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(colr, 3));
  sky.stars = new T.Points(g, new T.PointsMaterial({size:2, map:dotTex(), vertexColors:true, transparent:true, depthWrite:false, sizeAttenuation:false, fog:false}));
  sky.stars.frustumCulled = false; scene.add(sky.stars);
  var g2 = new T.BufferGeometry(), p2 = new Float32Array(400 * 3);
  for (i = 0; i < 400; i++){ var d2 = dirOnSky(hash(i * 5.3) * 6.28, Math.asin(.05 + hash(i * 7.7) * .95)).multiplyScalar(SKY_R); p2[i * 3] = d2.x; p2[i * 3 + 1] = d2.y * .7 + 6; p2[i * 3 + 2] = d2.z; }
  g2.setAttribute('position', new T.BufferAttribute(p2, 3));
  sky.bright = new T.Points(g2, new T.PointsMaterial({size:3.6, map:dotTex(), color:'#fffbe8', transparent:true, depthWrite:false, sizeAttenuation:false, fog:false}));
  sky.bright.frustumCulled = false; scene.add(sky.bright);
  /* 銀河帶：畫在 canvas 上的長條（亮核心＋暗帶＋細星），放在南方天空、斜斜升起 */
  var cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
  var cx2 = cv.getContext('2d'), rnd = function(k){ return hash(k * 7.13 + 2.1); };
  cx2.globalCompositeOperation = 'lighter';
  for (i = 0; i < 1600; i++){
    var x = rnd(i) * 1024, core = Math.exp(-Math.pow((x - 330) / 230, 2)), sp = 30 + core * 40;
    var yy = 128 + (rnd(i + 999) + rnd(i + 555) - 1) * sp + Math.sin(x / 90) * 10, r = 10 + rnd(i + 77) * (18 + core * 26);
    var gg = cx2.createRadialGradient(x, yy, 0, x, yy, r), a = .028 + core * .05;
    gg.addColorStop(0, 'rgba(' + Math.round(200 + core * 55) + ',' + Math.round(205 + core * 25) + ',' + Math.round(255 - core * 60) + ',' + a + ')'); gg.addColorStop(1, 'rgba(0,0,0,0)');
    cx2.fillStyle = gg; cx2.fillRect(x - r, yy - r, r * 2, r * 2);
  }
  cx2.globalCompositeOperation = 'destination-out';
  for (i = 0; i < 260; i++){
    var x2 = rnd(i + 3000) * 1024, y2 = 128 + Math.sin(x2 / 70) * 9 + (rnd(i + 3100) - .5) * 14, r2 = 6 + rnd(i + 3200) * 14;
    var g4 = cx2.createRadialGradient(x2, y2, 0, x2, y2, r2); g4.addColorStop(0, 'rgba(0,0,0,.35)'); g4.addColorStop(1, 'rgba(0,0,0,0)');
    cx2.fillStyle = g4; cx2.fillRect(x2 - r2, y2 - r2, r2 * 2, r2 * 2);
  }
  cx2.globalCompositeOperation = 'lighter';
  for (i = 0; i < 2200; i++){ var x3 = rnd(i + 5000) * 1024, y3 = 128 + (rnd(i + 6000) + rnd(i + 6500) + rnd(i + 7000) - 1.5) * 70; cx2.fillStyle = 'rgba(255,255,255,' + (.25 + rnd(i + 8000) * .6) + ')'; cx2.fillRect(x3, y3, rnd(i + 9000) < .1 ? 2 : 1, 1); }
  var fade = cx2.createLinearGradient(0, 0, 1024, 0); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(.12, 'rgba(0,0,0,0)'); fade.addColorStop(.85, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  cx2.globalCompositeOperation = 'destination-out'; cx2.fillStyle = fade; cx2.fillRect(0, 0, 1024, 256);
  var mwTex = new T.CanvasTexture(cv);
  sky.mw = new T.Mesh(new T.PlaneGeometry(560, 140), new T.MeshBasicMaterial({map:mwTex, transparent:true, opacity:.5, depthWrite:false, blending:T.AdditiveBlending, fog:false, side:T.DoubleSide}));
  sky.mw.position.set(-30, 62, 340); sky.mw.lookAt(0, 6, 0); sky.mw.rotateZ(-.5);
  sky.mw.renderOrder = -1; scene.add(sky.mw);
  /* 月亮：canvas 依月相畫 */
  sky.moonCv = document.createElement('canvas'); sky.moonCv.width = sky.moonCv.height = 128;
  sky.moonTex = new T.CanvasTexture(sky.moonCv);
  sky.moon = new T.Sprite(new T.SpriteMaterial({map:sky.moonTex, transparent:true, depthWrite:false, fog:false}));
  sky.moon.scale.set(26, 26, 1); scene.add(sky.moon);
  sky.halo = new T.Sprite(new T.SpriteMaterial({map:dotTex(true), color:'#cfd8ff', transparent:true, opacity:.3, depthWrite:false, blending:T.AdditiveBlending, fog:false}));
  sky.halo.scale.set(90, 90, 1); scene.add(sky.halo);
  /* 流星 */
  sky.meteors = [];
  for (i = 0; i < 6; i++){
    var lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
    var ln = new T.Line(lg, new T.LineBasicMaterial({color:'#fff6d8', transparent:true, opacity:0, fog:false})); ln.frustumCulled = false; scene.add(ln);
    sky.meteors.push({l:ln, t:-1, a:null, b:null});
  }
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
  var moonBright = n.illum * (n.darkH < n.nightH - .2 ? 1 : .25);   // 整晚無月時月光弱
  U.moon.value = .25 + moonBright * .75;
  hemi.intensity = .45 + moonBright * .7; moonLight.intensity = .25 + moonBright * 1.3; amb.intensity = .18 + moonBright * .2;
  var dk = Math.min(1, n.darkH / 6);
  sky.stars.material.opacity = .35 + dk * .65; sky.bright.material.opacity = .6 + dk * .4;
  sky.mw.material.opacity = n.gcH > 0 ? .15 + .5 * dk * Math.min(1, .45 + n.gcH / 4) : .06 + .14 * dk;
  sky.moon.visible = sky.halo.visible = n.illum > .03;
  sky.halo.material.opacity = .08 + n.illum * .32;
  drawMoon(n.illum, n.waxing);
  var az = Math.PI + (n.waxing ? .42 : -.42), alt = .16 + n.illum * .08, dv = dirOnSky(az, alt);   // 上弦前後在西南、下弦前後在東南（示意，面向南方時看得到）
  sky.moon.position.copy(dv).multiplyScalar(SKY_R * .9); sky.moon.position.y = dv.y * SKY_R * .63 + 6; sky.halo.position.copy(sky.moon.position);
  moonLight.position.copy(dv).multiplyScalar(60);
  sky.meteorRate = (SM.showersNear(cur.y, cur.m, cur.d)[0] || {zhr:0}).zhr;
}
function updateMeteors(t, dt){
  if (!sky.meteors) return;
  var rate = sky.meteorRate ? Math.min(2.4, sky.meteorRate / 50) : .06;
  sky.meteors.forEach(function(me){
    if (me.t < 0){
      if (Math.random() < dt * rate * (reduce ? .2 : 1) / sky.meteors.length * 3){
        var az = Math.random() * 6.28, al = .5 + Math.random() * .7, a = dirOnSky(az, al).multiplyScalar(SKY_R * .95), dir = new T.Vector3(Math.random() - .5, -.6 - Math.random() * .4, Math.random() - .5).normalize().multiplyScalar(40 + Math.random() * 40);
        a.y = a.y * .7 + 6; me.a = a; me.b = a.clone().add(dir); me.t = 0;
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

{{CLOUD}}
{{CAMERA}}
S.overview = function(){
  var a = host.clientWidth / Math.max(1, host.clientHeight);
  S.flyTo(-6, 0, a < .8 ? 100 : a < 1.2 ? 80 : 66, .78);
};
S.focusSpot = function(id){
  var S3 = SPOT3[id]; if (!S3) return;
  S.flyTo(S3.x, S3.z, 3.2 * aspectK(), 1.42, 1.3, S3.y + .7);
  fly.toP.copy(fly.toT).add(new T.Vector3().setFromSpherical(new T.Spherical(3.2 * aspectK(), 1.42, Math.PI)));   // 從北往南看：銀河核心在南方
};
/* ---------- 對外 ---------- */
S.setDate = function(y, m, d){ cur = {y:y, m:m, d:d}; if (S.ready) applyDate(); };
S.selectSpot = function(id){
  if (selId && SPOT3[selId]){ SPOT3[selId].label.el.classList.remove('on'); SPOT3[selId].label.boost = 0; SPOT3[selId].label.w = 0; }
  selId = id || null;
  if (selId && SPOT3[selId]){ SPOT3[selId].label.el.classList.add('on'); SPOT3[selId].label.boost = 10; SPOT3[selId].label.w = 0; }
};
S.setLabels = function(on){ showLabels = !!on; };
S.setReduce = function(on){ reduce = !!on; if (seaMat) seaMat.uniforms.uCalm.value = reduce ? .15 : 1; };
S.setLayer = function(on){ U.layer.value = on ? 1 : 0; };
S.resize = function(){ if (S.ready) resize(); };

{{INTERACT}}
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
  if (sky.stars){ var rot = reduce ? 0 : t * .004; sky.stars.rotation.y = sky.bright.rotation.y = rot; sky.bright.material.size = 3.4 + Math.sin(t * 2.3) * .3; }
  SM.SPOTS.forEach(function(p){ var f = SPOT3[p.id].grp.userData.flag; if (f && !reduce) f.rotation.y = Math.sin(t * 3 + SPOT3[p.id].idx) * .3; });
  updateMeteors(t, dt);
  clouds.forEach(function(C){ C.g.position.x += dt * C.v * (reduce ? .3 : 1); if (C.g.position.x > EXT.x1 + 20) C.g.position.x = EXT.x0 - 20; });
  renderer.render(scene, camera);
  layoutLabels();
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
    applyDate();
    S.overview(); fly.dur = .01;
    loop();
  });
};
S.stats = function(){
  return {spots:Object.keys(SPOT3).length, islands:ISL.length, labels:labels.length, visibleLabels:labels.filter(function(L){ return !L.off; }).length,
    date:cur, illum:NIGHT ? +NIGHT.illum.toFixed(2) : null, darkH:NIGHT ? +NIGHT.darkH.toFixed(1) : null, gcH:NIGHT ? +NIGHT.gcH.toFixed(1) : null,
    mw:sky.mw ? +sky.mw.material.opacity.toFixed(2) : null, meteorRate:sky.meteorRate || 0, layer:U.layer.value};
};
})();

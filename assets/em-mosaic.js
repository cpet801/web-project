/* ============================================================
   English Mastered — mosaic engine v7-facet (production)
   Renders the brand's shard mosaics live on <canvas>, at true
   element size, with facet density normalised to the 1200×420
   reference so shard size matches the approved studio specs.

   Usage: give any positioned container the attribute
     data-em-mosaic="surf | surf-footer | surf-bar | goal"
     data-em-color="#013049"          (surface colour)
     data-em-idx="0..5"               (goal cards: window/flip slot)
     data-em-card="ielts | toefl"     (goal cards: per-card tweaks)
   The script inserts an absolutely-positioned canvas as the
   element's first child and re-renders on resize.
   Specs © brand guide — "engine v7-facet production specs".
   ============================================================ */
(function () {
  'use strict';

  /* ---------- finalized parameter sets ---------- */
  var SPEC_SURF = { facets: 52, jitter: 0.76, warp: 0.7, warpSize: 1.65, diagMix: 0, coherence: 0.7, waveSize: 0.96, waveStretch: 1, waveAngle: 31, relief: 0.26, depthLum: 0.1, angle: 240, strength: 0.15, floor: 0.87, ceil: 1.15, sheen: 0.125, sheenW: 55, burnish: 0.19, brush: 0.11, edge: 0, toneJit: 0.03, vignette: 0.6, focalX: 0.4, focalY: 0.3, focalDim: 0, bright: 0.95, blend: 0.8, bloom: 0.4, wave2: 0.1, wave2Angle: 140 };
  var SPEC_GOAL = { facets: 80, jitter: 0.6, warp: 0.72, warpSize: 1.1, diagMix: 1, coherence: 0.6, waveSize: 0.7, waveStretch: 1.4, waveAngle: 31, relief: 0.22, depthLum: 0.065, angle: 240, strength: 0.3, floor: 0.8, ceil: 1.2, sheen: 0.1, sheenW: 31, burnish: 0.1, brush: 0.09, edge: 0, toneJit: 0.02, vignette: 0.24, focalX: 0.5, focalY: 0.42, focalDim: 0, bright: 1.01, blend: 0.85, bloom: 0.32, wave2: 0, wave2Angle: 115 };
  var SPEC_GOAL_BRIGHT = { facets: 80, jitter: 0.6, warp: 0.72, warpSize: 1.1, diagMix: 1, coherence: 0.85, waveSize: 0.85, waveStretch: 2, waveAngle: 28, relief: 0.22, depthLum: 0.05, angle: 240, strength: 0.18, floor: 0.9, ceil: 1.09, sheen: 0.06, sheenW: 42, burnish: 0.07, brush: 0.06, edge: 0, toneJit: 0.015, vignette: 0.3, focalX: 0.5, focalY: 0.42, focalDim: 0, bright: 0.84, blend: 0.85, bloom: 0.32, wave2: 0, wave2Angle: 115 };

  var KINDS = {
    'surf':        { spec: SPEC_SURF, seed: 7, minH: 200, over: null },
    'surf-band':   { spec: SPEC_SURF, seed: 7, minH: 190, over: { blend: 0.5, bloom: 0.175 } },
    'surf-footer': { spec: SPEC_SURF, seed: 7, minH: 220, over: { blend: 0.5, bloom: 0.175, vignette: 0.6, focalDim: 0.18 }, flip: 'scale(-1,-1)' },
    'surf-bar':    { spec: SPEC_SURF, seed: 7, minH: 150, over: { vignette: 0.15, focalY: 0.5 } },
    'goal':        { spec: null, seed: 1944626171, minH: 230, wf: 1.6 }
  };
  var GOAL_WINDOWS = ['0% 50%', '100% 50%', '38% 50%', '72% 50%', '14% 50%', '88% 50%'];
  var GOAL_FLIPS = ['none', 'scale(1,-1)', 'scale(-1,1)', 'scale(-1,-1)', 'scale(-1,1)', 'scale(1,-1)'];
  var CARD_TWEAKS = {
    ielts: { relief: 0.3, blend: 0.72, brush: 0.09, toneJit: 0.025 },
    toefl: { focalX: 0.54, vignette: 0.22 }
  };

  /* ---------- seeded RNG + value noise ---------- */
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function makeNoise(seed) {
    var r = mulberry(seed), perm = new Uint8Array(512), vals = new Float32Array(256);
    var p = new Uint8Array(256), i, j, t;
    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) { j = (r() * (i + 1)) | 0; t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];
    for (i = 0; i < 256; i++) vals[i] = r() * 2 - 1;
    return function (x, y) {
      var fx = Math.floor(x), fy = Math.floor(y);
      var xi = fx & 255, yi = fy & 255, xf = x - fx, yf = y - fy;
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      var a = vals[perm[xi + perm[yi]]], b = vals[perm[xi + 1 + perm[yi]]];
      var c = vals[perm[xi + perm[yi + 1]]], d = vals[perm[xi + 1 + perm[yi + 1]]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  function fbm(n, x, y, oct) { var f = 0, amp = 0.5, fr = 1, o; for (o = 0; o < oct; o++) { f += amp * n(x * fr, y * fr); fr *= 2; amp *= 0.5; } return f; }

  function hexHsl(hex) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2, d;
    if (mx !== mn) {
      d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4); h /= 6;
    }
    return [h, s, l];
  }

  function hslRgb(h, s, l) {
    h = ((h % 1) + 1) % 1; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    if (s === 0) { var v = l * 255; return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, pq = 2 * l - q;
    function f(t) { t = ((t % 1) + 1) % 1; if (t < 1 / 6) return pq + (q - pq) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return pq + (q - pq) * (2 / 3 - t) * 6; return pq; }
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }

  /* ---------- the renderer (byte-identical to the approved preview) ---------- */
  function render7(cv, W, H, P, hex, sd) {
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var cols = Math.max(4, Math.round(Math.sqrt(P.facets / 2 * W / H)));
    var rows = Math.max(3, Math.round(cols * H / W));
    var cw = W / cols, chh = H / rows;
    var r = mulberry(sd * 7919 + 17);
    var nA = makeNoise(sd * 131 + 7), nB = makeNoise(sd * 313 + 5), nC = makeNoise(sd * 547 + 11);
    var fWarp = 1 / (Math.max(0.3, P.warpSize) * 260);
    var fWave = 1 / (Math.max(0.2, P.waveSize) * 340);
    var ampW = P.warp * cw * 1.1;
    var diagMix = P.diagMix || 0;
    var NV = (cols + 1) * (rows + 1);
    var vx = new Float32Array(NV), vy = new Float32Array(NV), vz = new Float32Array(NV), vs = new Float32Array(NV);
    var fxc = W * (P.focalX != null ? P.focalX : 0.5), fyc = H * (P.focalY != null ? P.focalY : 0.42);
    var maxD = Math.hypot(Math.max(fxc, W - fxc), Math.max(fyc, H - fyc));
    var waR = (P.waveAngle != null ? P.waveAngle : 25) * Math.PI / 180, wstrG = Math.max(1, P.waveStretch || 1);
    var cwa = Math.cos(waR), swa = Math.sin(waR);
    var w2amp = P.wave2 || 0, wa2 = (P.wave2Angle != null ? P.wave2Angle : 115) * Math.PI / 180;
    var cw2 = Math.cos(wa2), sw2 = Math.sin(wa2);
    var i, j, k, x, y, bx, ex, by, ey, rx, ry, s, zr, rx2, ry2;
    for (j = 0; j <= rows; j++) for (i = 0; i <= cols; i++) {
      k = j * (cols + 1) + i;
      bx = i === 0; ex = i === cols; by = j === 0; ey = j === rows;
      x = i * cw; y = j * chh;
      if (!bx && !ex) x += (r() - 0.5) * P.jitter * cw * 0.9; else r();
      if (!by && !ey) y += (r() - 0.5) * P.jitter * chh * 0.9; else r();
      if (!bx && !ex) x += fbm(nA, x * fWarp, y * fWarp, 2) * ampW;
      if (!by && !ey) y += fbm(nA, (x + 511) * fWarp, (y + 173) * fWarp, 2) * ampW;
      rx = (x * cwa + y * swa); ry = (-x * swa + y * cwa) / wstrG;
      s = fbm(nB, rx * fWave, ry * fWave, 3);
      if (w2amp > 0.01) {
        rx2 = (x * cw2 + y * sw2); ry2 = (-x * sw2 + y * cw2) / 2.5;
        s += w2amp * fbm(nC, rx2 * fWave * 1.7, ry2 * fWave * 1.7, 2) * 0.7;
      }
      zr = (r() - 0.5) * 2;
      vx[k] = x; vy[k] = y; vs[k] = s;
      vz[k] = (P.coherence * s * 1.7 + (1 - P.coherence) * zr) * P.relief * cw * 0.9;
    }
    var az = P.angle * Math.PI / 180, el = 0.7;
    var Lx = Math.cos(az) * Math.cos(el), Ly = Math.sin(az) * Math.cos(el), Lz = Math.sin(el);
    var Hx = Lx, Hy = Ly, Hz = Lz + 1, Hl = Math.hypot(Hx, Hy, Hz); Hx /= Hl; Hy /= Hl; Hz /= Hl;
    var HSL = hexHsl(hex), bh = HSL[0], bs = HSL[1], bl = HSL[2];
    var bg = hslRgb(bh, bs, bl);
    ctx.fillStyle = 'rgb(' + (bg[0] | 0) + ',' + (bg[1] | 0) + ',' + (bg[2] | 0) + ')';
    ctx.fillRect(0, 0, W, H);
    var soft = P.blend || 0, gouraud = soft > 0.03;
    var vAcc = new Float32Array(NV), vCnt = new Float32Array(NV);
    var faces = [];
    var rD = mulberry(sd * 104729 + 3);
    var a, b, c, d, diag, tris, tt, ia, ib, ic, x1, y1, z1, x2, y2, z2, x3, y3, z3, nx, ny, nz, nl, ndl, fL, tj, sAvg;
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      a = j * (cols + 1) + i; b = a + 1; c = a + cols + 1; d = c + 1;
      diag = (i + j) % 2 === 0;
      if (rD() < diagMix) diag = rD() < 0.5;
      tris = diag ? [[a, b, d], [a, d, c]] : [[b, c, a], [b, d, c]];
      for (tt = 0; tt < 2; tt++) {
        ia = tris[tt][0]; ib = tris[tt][1]; ic = tris[tt][2];
        x1 = vx[ia]; y1 = vy[ia]; z1 = vz[ia];
        x2 = vx[ib]; y2 = vy[ib]; z2 = vz[ib];
        x3 = vx[ic]; y3 = vy[ic]; z3 = vz[ic];
        nx = (y2 - y1) * (z3 - z1) - (z2 - z1) * (y3 - y1);
        ny = (z2 - z1) * (x3 - x1) - (x2 - x1) * (z3 - z1);
        nz = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        ndl = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
        fL = 1 + (ndl - 0.7) * P.strength * 2.2;
        fL = Math.max(P.floor, Math.min(P.ceil, fL));
        tj = (r() - 0.5) * P.toneJit * 2;
        sAvg = (vs[ia] + vs[ib] + vs[ic]) / 3;
        faces.push({ ia: ia, ib: ib, ic: ic, fL: fL, tj: tj, sAvg: sAvg, nx: nx, ny: ny, nz: nz });
        vAcc[ia] += fL; vCnt[ia]++; vAcc[ib] += fL; vCnt[ib]++; vAcc[ic] += fL; vCnt[ic]++;
      }
    }
    function rgbstr(cc) { return 'rgb(' + (cc[0] | 0) + ',' + (cc[1] | 0) + ',' + (cc[2] | 0) + ')'; }
    var fi, F, cx, cy, extras, dd, sp, bur, m;
    for (fi = 0; fi < faces.length; fi++) {
      F = faces[fi];
      x1 = vx[F.ia]; y1 = vy[F.ia]; x2 = vx[F.ib]; y2 = vy[F.ib]; x3 = vx[F.ic]; y3 = vy[F.ic];
      cx = (x1 + x2 + x3) / 3; cy = (y1 + y2 + y3) / 3;
      extras = (1 + F.tj) * (1 + F.sAvg * P.depthLum * 2);
      dd = Math.hypot(cx - fxc, cy - fyc) / maxD;
      extras *= (1 - P.vignette * Math.pow(dd, 1.8) * 0.9) * (1 - (P.focalDim || 0) * Math.pow(Math.max(0, 1 - dd), 1.6)) * P.bright;
      sp = Math.pow(Math.max(0, F.nx * Hx + F.ny * Hy + F.nz * Hz), P.sheenW) * P.sheen;
      bur = (P.burnish || 0) * Math.max(0, F.sAvg) * 0.9;
      m = Math.min(0.55, (sp > 0.002 ? Math.min(0.5, sp) : 0) + bur);
      var colOf = function (lum) { return hslRgb(bh, bs, Math.max(0.02, Math.min(0.96, bl * lum * (1 + m * 1.1)))); };
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
      if (gouraud) {
        var lumAt = function (kk, px, py) {
          var L0 = F.fL * (1 - soft) + (vAcc[kk] / vCnt[kk]) * soft;
          if (P.brush > 0.002) {
            var t2 = Math.max(-1, Math.min(1, ((px - cx) * Lx + (py - cy) * Ly) / (cw * 0.6)));
            L0 *= 1 + P.brush * t2;
          }
          return L0 * extras;
        };
        var l1 = lumAt(F.ia, x1, y1), l2 = lumAt(F.ib, x2, y2), l3 = lumAt(F.ic, x3, y3);
        var lmin = Math.min(l1, l2, l3), lmax = Math.max(l1, l2, l3);
        if (lmax - lmin < 0.004) {
          ctx.fillStyle = rgbstr(colOf((l1 + l2 + l3) / 3));
        } else {
          var d1x = x2 - x1, d1y = y2 - y1, d2x = x3 - x1, d2y = y3 - y1;
          var det = (d1x * d2y - d1y * d2x) || 1e-6;
          var gx = ((l2 - l1) * d2y - (l3 - l1) * d1y) / det;
          var gy = ((l3 - l1) * d1x - (l2 - l1) * d2x) / det;
          var gl = Math.hypot(gx, gy);
          if (gl < 1e-9) {
            ctx.fillStyle = rgbstr(colOf((l1 + l2 + l3) / 3));
          } else {
            var ux = gx / gl, uy = gy / gl;
            var t1p = x1 * ux + y1 * uy, t2p = x2 * ux + y2 * uy, t3p = x3 * ux + y3 * uy;
            var tmin = Math.min(t1p, t2p, t3p), tmax = Math.max(t1p, t2p, t3p);
            var gr = ctx.createLinearGradient(ux * tmin, uy * tmin, ux * tmax, uy * tmax);
            gr.addColorStop(0, rgbstr(colOf(lmin)));
            gr.addColorStop(1, rgbstr(colOf(lmax)));
            ctx.fillStyle = gr;
          }
        }
      } else {
        ctx.fillStyle = rgbstr(colOf(F.fL * extras));
      }
      ctx.fill();
    }
    if ((P.bloom || 0) > 0.01) {
      var tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
      tmp.getContext('2d').drawImage(cv, 0, 0);
      ctx.save();
      ctx.filter = 'blur(' + Math.max(2, cw * 0.22) + 'px)';
      ctx.globalAlpha = Math.min(0.7, P.bloom);
      ctx.drawImage(tmp, 0, 0);
      ctx.restore();
    }
  }

  /* ---------- mounting ---------- */
  function assign(t) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; if (s) for (var k in s) t[k] = s[k]; } return t; }

  function paintEl(el) {
    var kind = KINDS[el.getAttribute('data-em-mosaic')];
    if (!kind) return;
    var cv = el.__emCv;
    if (!cv) {
      cv = document.createElement('canvas');
      cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover;pointer-events:none;';
      el.insertBefore(cv, el.firstChild);
      el.__emCv = cv;
    }
    var color = el.getAttribute('data-em-color') || '#013049';
    var idx = parseInt(el.getAttribute('data-em-idx') || '0', 10);
    var spec, over = null, seed = kind.seed, wf = kind.wf || 1, flip = kind.flip;
    if (kind.spec) {
      spec = kind.spec; over = kind.over;
    } else {
      var lit = hexHsl(color)[2] > 0.3;
      spec = lit ? SPEC_GOAL_BRIGHT : SPEC_GOAL;
      over = CARD_TWEAKS[el.getAttribute('data-em-card') || ''] || null;
      cv.style.objectPosition = GOAL_WINDOWS[idx % 6];
      flip = GOAL_FLIPS[idx % 6];
    }
    if (flip && flip !== 'none') cv.style.transform = flip;
    var rc = el.getBoundingClientRect();
    var w = Math.round(Math.max(320, rc.width || 1200) * wf);
    var h = Math.max(kind.minH, Math.round(rc.height || kind.minH));
    if (cv.__emW === w && cv.__emH === h) return;
    cv.__emW = w; cv.__emH = h;
    var P = assign({}, spec, over);
    P.facets = Math.max(8, Math.round(spec.facets * (w * h) / (1200 * 420)));
    render7(cv, w, h, P, color, seed);
  }

  function paintAll() {
    var els = document.querySelectorAll('[data-em-mosaic]');
    for (var i = 0; i < els.length; i++) paintEl(els[i]);
  }

  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(paintAll, 180); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintAll);
  else paintAll();

  /* re-paint hook for late-mounted elements (e.g. cards injected by other scripts) */
  window.EMMosaic = { paint: paintAll, paintEl: paintEl, render7: render7 };
})();

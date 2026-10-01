// Torsion-angle lab: rebuild an RNA backbone from torsion angles with constant bond lengths and bond angles (NeRF)
(function () {
  const D = window.TORSION_DATA, root = document.getElementById("tlab");
  if (!D || !root) return;
  const $ = (s) => root.querySelector(s), $$ = (s) => Array.from(root.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cv = $("#tlCanvas"), ctx = cv.getContext("2d"), pf = $("#tlProfile"), pctx = pf.getContext("2d");

  const BB = ["P", "O5'", "C5'", "C4'", "C3'", "O3'"];
  // the dihedral that places each atom, from the three atoms before it in the chain
  const TYPE = { "P": "ε", "O5'": "ζ", "C5'": "α", "C4'": "β", "C3'": "γ", "O3'": "δ" };
  const AFORM = { "α": -68, "β": 178, "γ": 54, "δ": 82, "ε": -153, "ζ": -71 };
  const DEF = {
    "α": ["O3′ (i−1)", "P", "O5′", "C5′"], "β": ["P", "O5′", "C5′", "C4′"], "γ": ["O5′", "C5′", "C4′", "C3′"],
    "δ": ["C5′", "C4′", "C3′", "O3′"], "ε": ["C4′", "C3′", "O3′", "P (i+1)"], "ζ": ["C3′", "O3′", "P (i+1)", "O5′ (i+1)"],
    "η": ["C4′ (i−1)", "P", "C4′", "P (i+1)"], "θ": ["P", "C4′", "P (i+1)", "C4′ (i+1)"],
  };
  const PSEUDO = new Set(["η", "θ"]);

  // colours
  let col = {};
  const hex = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ["a", "t", "g", "c", "fg", "muted", "bg", "line"]) col[k] = hex(cs.getPropertyValue("--" + k).trim() || "#888");
    dirty = true; drawProfile();
  }
  const rainbow = (f) => { const s = [col.a, col.g, col.c, col.t], x = f * 3, i = Math.min(Math.floor(x), 2); return mix(s[i], s[i + 1], x - i); };

  // vector helpers
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = (a) => scl(a, 1 / Math.hypot(...a));
  const RAD = Math.PI / 180;
  const wrap = (x) => ((x + 540) % 360) - 180;

  // NeRF: place atom d from a, b, c given |cd|, angle bcd and dihedral abcd
  function place(a, b, c, bond, angle, tors) {
    const bc = nrm(sub(c, b)), n = nrm(crs(sub(b, a), bc)), m = crs(n, bc);
    const t = angle * RAD, p = tors * RAD;
    return add(c, add(scl(bc, -bond * Math.cos(t)), add(scl(m, bond * Math.sin(t) * Math.cos(p)), scl(n, bond * Math.sin(t) * Math.sin(p)))));
  }
  function dihedral(p0, p1, p2, p3) {
    const b0 = sub(p0, p1), b1 = nrm(sub(p2, p1)), b2 = sub(p3, p2);
    const v = sub(b0, scl(b1, dot(b0, b1))), w = sub(b2, scl(b1, dot(b2, b1)));
    return Math.atan2(dot(crs(b1, v), w), dot(v, w)) / RAD;
  }
  const bondOf = (names, i) => D.bond[names[i - 1] + "-" + names[i]];
  const angOf = (names, i) => D.angle[names[i - 2] + "-" + names[i - 1] + "-" + names[i]];
  function build(names, T, seed) {
    const Y = seed.slice(0, 3);
    for (let i = 3; i < names.length; i++) Y.push(place(Y[i - 3], Y[i - 2], Y[i - 1], bondOf(names, i), angOf(names, i), T[i]));
    return Y;
  }

  // optimal superposition (Horn's quaternion method, Jacobi eigen-solver)
  function superpose(P, Q) {
    const n = P.length, cp = [0, 0, 0], cq = [0, 0, 0];
    P.forEach((p) => { cp[0] += p[0] / n; cp[1] += p[1] / n; cp[2] += p[2] / n; });
    Q.forEach((q) => { cq[0] += q[0] / n; cq[1] += q[1] / n; cq[2] += q[2] / n; });
    const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let k = 0; k < n; k++) { const p = sub(P[k], cp), q = sub(Q[k], cq); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) S[a][b] += p[a] * q[b]; }
    const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
    const N = [[xx + yy + zz, yz - zy, zx - xz, xy - yx], [yz - zy, xx - yy - zz, xy + yx, zx + xz], [zx - xz, xy + yx, -xx + yy - zz, yz + zy], [xy - yx, zx + xz, yz + zy, -xx - yy + zz]];
    const [w, x, y, z] = topEigen(N);
    const R = [[w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)], [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)], [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z]];
    let s = 0;
    const out = P.map((p, k) => { const d = sub(p, cp), r = add([dot(R[0], d), dot(R[1], d), dot(R[2], d)], cq); const e = sub(r, Q[k]); s += dot(e, e); return r; });
    return { X: out, rmsd: Math.sqrt(s / n) };
  }
  function topEigen(M) {
    const a = M.map((r) => r.slice()), v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    for (let sweep = 0; sweep < 30; sweep++) {
      let off = 0;
      for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p][q] * a[p][q];
      if (off < 1e-12) break;
      for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 4; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < 4; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < 4; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
      }
    }
    let best = 0; for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
    return [v[0][best], v[1][best], v[2][best], v[3][best]];
  }

  // seeded gaussian noise so moving the slider rescales the same error pattern
  let seed = 7, gauss = [];
  function reseed() {
    let s = seed++ * 2654435761 >>> 0;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    gauss = Array.from({ length: 600 }, () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd()));
  }

  // sources: the real tRNA, or an ideal A-form helix built from textbook angles
  let src, names, resOf, nRes, ref, refT, baseT, idx;
  function setSource(kind) {
    if (kind === "trna") {
      names = D.names; resOf = D.res; nRes = D.seq.length; ref = D.xyz; refT = D.tors; baseT = D.tors;
    } else {
      nRes = 30; names = []; resOf = [];
      for (let r = 0; r < nRes; r++) BB.forEach((a) => { names.push(a); resOf.push(r); });
      baseT = names.map((a, i) => i < 3 ? null : AFORM[TYPE[a]]);
      const b0 = D.bond["P-O5'"], b1 = D.bond["O5'-C5'"], t = D.angle["P-O5'-C5'"] * RAD;
      const seedA = [[0, 0, 0], [b0, 0, 0], [b0 - b1 * Math.cos(t), b1 * Math.sin(t), 0]];
      ref = build(names, baseT, seedA); refT = baseT;
      const c = ref.reduce((s, p) => add(s, scl(p, 1 / ref.length)), [0, 0, 0]);
      ref = ref.map((p) => sub(p, c));
    }
    src = kind;
    idx = Array.from({ length: nRes }, () => ({}));
    names.forEach((a, i) => { idx[resOf[i]][a] = i; });
    maxR = Math.max(...ref.map((p) => Math.hypot(...p)));
    hiRes = Math.floor(nRes / 2);
    recompute();
  }

  // state
  const offsets = { "α": 0, "β": 0, "γ": 0, "δ": 0, "ε": 0, "ζ": 0 };
  let sigma = 0, sel = "α", hiRes = 0, X = [], curT = [], rmsd = 0, mae = 0, maxR = 1, buildK = Infinity, dirty = true;
  function recompute() {
    curT = names.map((a, i) => i < 3 ? null : baseT[i] + offsets[TYPE[a]] + sigma * gauss[i % gauss.length]);
    const seedAtoms = ref.slice(0, 3);
    const Y = build(names, curT, seedAtoms);
    const sp = superpose(Y, ref); X = sp.X; rmsd = sp.rmsd;
    let s = 0, k = 0;
    for (let i = 3; i < names.length; i++) { s += Math.abs(wrap(curT[i] - refT[i])); k++; }
    mae = s / k;
    $("#tlMae").textContent = mae.toFixed(1) + "°";
    $("#tlRmsd").textContent = rmsd.toFixed(1) + " Å";
    $("#tlAtoms").textContent = `${Math.min(buildK, names.length)} / ${names.length}`;
    updateValue(); dirty = true; drawProfile();
  }

  // atoms defining angle `t` at residue r (null at chain ends)
  function quad(t, r) {
    const g = (rr, a) => (idx[rr] && idx[rr][a] != null ? idx[rr][a] : null);
    const map = {
      "α": [[r - 1, "O3'"], [r, "P"], [r, "O5'"], [r, "C5'"]], "β": [[r, "P"], [r, "O5'"], [r, "C5'"], [r, "C4'"]],
      "γ": [[r, "O5'"], [r, "C5'"], [r, "C4'"], [r, "C3'"]], "δ": [[r, "C5'"], [r, "C4'"], [r, "C3'"], [r, "O3'"]],
      "ε": [[r, "C4'"], [r, "C3'"], [r, "O3'"], [r + 1, "P"]], "ζ": [[r, "C3'"], [r, "O3'"], [r + 1, "P"], [r + 1, "O5'"]],
      "η": [[r - 1, "C4'"], [r, "P"], [r, "C4'"], [r + 1, "P"]], "θ": [[r, "P"], [r, "C4'"], [r + 1, "P"], [r + 1, "C4'"]],
    };
    const q = map[t].map(([rr, a]) => g(rr, a));
    return q.some((v) => v == null) ? null : q;
  }
  const angleAt = (coords, t, r) => { const q = quad(t, r); return q ? dihedral(...q.map((i) => coords[i])) : null; };
  const resLabel = (r) => (src === "trna" ? D.seq[r] + D.num[r] : "nt " + (r + 1));
  function updateValue() {
    $("#tlDef").innerHTML = `<b>${sel}</b> = ${DEF[sel].join(" – ")}` + (PSEUDO.has(sel) ? " <span class=\"muted\">(pseudo-torsion, coarse-grained)</span>" : "");
    const a = angleAt(X, sel, hiRes), b = angleAt(ref, sel, hiRes);
    $("#tlValue").innerHTML = a == null ? `${resLabel(hiRes)}: undefined at the chain end`
      : `${resLabel(hiRes)}: <b>${a.toFixed(0)}°</b> rebuilt · ${b.toFixed(0)}° ${src === "trna" ? "in the crystal" : "ideal"}`;
    const off = $("#tlOffset");
    off.disabled = PSEUDO.has(sel);
    off.value = PSEUDO.has(sel) ? 0 : offsets[sel];
    $("#tlOffsetVal").textContent = PSEUDO.has(sel) ? "derived" : (offsets[sel] > 0 ? "+" : "") + offsets[sel] + "°";
  }

  // 3D view
  let R = mul3(rotM(-0.5, 0), rotM(0, 0.6)), zoom = 1, W = 0, H = 0, dpr = 1, spin = !reduced, dragging = false, visible = false, loop = false;
  function rotM(ax, ay) {
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
    return mul3([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]);
  }
  function mul3(a, b) { return a.map((r) => [0, 1, 2].map((j) => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j])); }
  function resize() {
    const r = cv.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const pr = pf.getBoundingClientRect(); pf.width = Math.round(pr.width * dpr); pf.height = Math.round(pr.height * dpr);
    dirty = true; drawProfile();
  }
  new ResizeObserver(resize).observe(root);

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (!W) return;
    const fit = Math.min(W, H) * 0.45 / maxR * zoom, Dc = maxR * 4;
    const pr = (p) => { const q = [dot(R[0], p), dot(R[1], p), dot(R[2], p)], s = Dc / (Dc + q[2]); return [W / 2 + q[0] * fit * s, H / 2 - q[1] * fit * s, q[2], s]; };
    const pRef = ref.map(pr), pX = X.map(pr), n = names.length, K = Math.min(buildK, n);
    const depth = (z) => Math.min(Math.max((z + maxR) / (2 * maxR), 0), 1) * 0.55;
    const items = [];
    for (let i = 0; i < n - 1; i++) items.push({ z: (pRef[i][2] + pRef[i + 1][2]) / 2 + 0.02, k: 0, i });
    for (let i = 0; i < K - 1; i++) items.push({ z: (pX[i][2] + pX[i + 1][2]) / 2, k: 1, i });
    for (let i = 0; i < K; i++) if (names[i] === "P") items.push({ z: pX[i][2] - 0.01, k: 2, i });
    items.sort((a, b) => b.z - a.z);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const it of items) {
      const f = depth(it.z);
      if (it.k === 0) {
        ctx.strokeStyle = rgb(mix(col.muted, col.bg, 0.25 + f), 0.55); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pRef[it.i][0], pRef[it.i][1]); ctx.lineTo(pRef[it.i + 1][0], pRef[it.i + 1][1]); ctx.stroke();
      } else if (it.k === 1) {
        ctx.strokeStyle = rgb(mix(rainbow(resOf[it.i] / (nRes - 1)), col.bg, f)); ctx.lineWidth = Math.max(2, 4.2 * pX[it.i][3] * zoom);
        ctx.beginPath(); ctx.moveTo(pX[it.i][0], pX[it.i][1]); ctx.lineTo(pX[it.i + 1][0], pX[it.i + 1][1]); ctx.stroke();
      } else {
        ctx.fillStyle = rgb(mix(col.fg, col.bg, f)); ctx.beginPath(); ctx.arc(pX[it.i][0], pX[it.i][1], Math.max(2, 3.4 * pX[it.i][3] * zoom), 0, 7); ctx.fill();
      }
    }
    // the four atoms that define the selected angle
    const q = quad(sel, hiRes);
    if (q && q.every((i) => i < K)) {
      ctx.strokeStyle = rgb(col.a); ctx.lineWidth = 3.5; ctx.beginPath();
      q.forEach((i, j) => (j ? ctx.lineTo(pX[i][0], pX[i][1]) : ctx.moveTo(pX[i][0], pX[i][1]))); ctx.stroke();
      q.forEach((i) => {
        ctx.fillStyle = rgb(col.a); ctx.beginPath(); ctx.arc(pX[i][0], pX[i][1], 4.5, 0, 7); ctx.fill();
        ctx.strokeStyle = rgb(col.bg); ctx.lineWidth = 1.5; ctx.stroke();
      });
      // one label for the whole quadruplet, pushed away from the molecule centre
      const cx = q.reduce((s, i) => s + pX[i][0], 0) / 4, cy = q.reduce((s, i) => s + pX[i][1], 0) / 4;
      const dx = cx - W / 2, dy = cy - H / 2, d = Math.hypot(dx, dy) || 1, lx = cx + dx / d * 34, ly = cy + dy / d * 34;
      const txt = `${sel} · ${resLabel(hiRes)}`;
      ctx.strokeStyle = rgb(col.a, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.font = "600 12px 'JetBrains Mono', monospace"; const tw = ctx.measureText(txt).width;
      ctx.fillStyle = rgb(col.a); ctx.beginPath(); ctx.roundRect(lx - tw / 2 - 7, ly - 11, tw + 14, 22, 6); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, lx, ly);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    }
    if (K < n && K > 0) { ctx.fillStyle = rgb(col.a); ctx.beginPath(); ctx.arc(pX[K - 1][0], pX[K - 1][1], 7, 0, 7); ctx.fill(); }
    ctx.font = "600 11px 'JetBrains Mono', monospace"; ctx.fillStyle = rgb(col.muted);
    ctx.fillText("5′", pX[0][0] + 8, pX[0][1] + 14);
    if (K >= n) ctx.fillText("3′", pX[n - 1][0] + 8, pX[n - 1][1] + 14);
  }

  // angle profile along the chain for the selected angle
  function drawProfile() {
    if (!pf.width || !X.length) return;
    const w = pf.width / dpr, h = pf.height / dpr, padL = 34, padR = 8, padT = 8, padB = 16;
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0); pctx.clearRect(0, 0, w, h);
    const xs = (r) => padL + (r + 0.5) / nRes * (w - padL - padR), ys = (a) => padT + (180 - a) / 360 * (h - padT - padB);
    pctx.font = "10px 'JetBrains Mono', monospace"; pctx.fillStyle = rgb(col.muted); pctx.textAlign = "right"; pctx.textBaseline = "middle";
    [-180, -90, 0, 90, 180].forEach((a) => {
      pctx.strokeStyle = rgb(col.line); pctx.lineWidth = 1; pctx.beginPath(); pctx.moveTo(padL, ys(a)); pctx.lineTo(w - padR, ys(a)); pctx.stroke();
      pctx.fillText(a + "°", padL - 4, ys(a));
    });
    pctx.fillStyle = rgb(col.a, 0.12); const bw = (w - padL - padR) / nRes;
    pctx.fillRect(xs(hiRes) - bw / 2, padT, bw, h - padT - padB);
    for (let r = 0; r < nRes; r++) {
      const a = angleAt(ref, sel, r), b = angleAt(X, sel, r);
      if (a == null) continue;
      pctx.strokeStyle = rgb(col.muted); pctx.lineWidth = 1.5; pctx.beginPath(); pctx.arc(xs(r), ys(a), 2.6, 0, 7); pctx.stroke();
      pctx.fillStyle = rgb(rainbow(r / (nRes - 1))); pctx.beginPath(); pctx.arc(xs(r), ys(b), 2.4, 0, 7); pctx.fill();
    }
    pctx.textAlign = "left"; pctx.textBaseline = "alphabetic"; pctx.fillStyle = rgb(col.muted);
    pctx.fillText("5′", padL, h - 3); pctx.textAlign = "right"; pctx.fillText("3′", w - padR, h - 3);
  }
  pf.addEventListener("pointermove", (e) => {
    const r = pf.getBoundingClientRect(), padL = 34, padR = 8;
    const k = Math.floor((e.clientX - r.left - padL) / (r.width - padL - padR) * nRes);
    if (k >= 0 && k < nRes && k !== hiRes) { hiRes = k; updateValue(); dirty = true; drawProfile(); kick(); }
  });

  function frame() {
    if (!visible) { loop = false; return; }
    if (spin && !dragging) { R = mul3(rotM(0, 0.004), R); dirty = true; }
    if (buildAnim) {
      buildK = Math.min(names.length, Math.floor((performance.now() - buildAnim) / 3200 * names.length) + 3);
      $("#tlAtoms").textContent = `${buildK} / ${names.length}`;
      if (buildK >= names.length) { buildAnim = 0; buildK = Infinity; }
      dirty = true;
    }
    if (dirty) { draw(); dirty = false; }
    requestAnimationFrame(frame);
  }
  let buildAnim = 0;
  const kick = () => { if (!loop && visible) { loop = true; requestAnimationFrame(frame); } };
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }).observe(cv);

  // pointer: drag to rotate, hover to pick a residue
  let last = null;
  cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); dragging = true; last = [e.clientX, e.clientY]; });
  cv.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    R = mul3(rotM((e.clientY - last[1]) * 0.01, (e.clientX - last[0]) * 0.01), R); last = [e.clientX, e.clientY]; dirty = true; kick();
  });
  cv.addEventListener("pointerup", () => { dragging = false; });
  cv.addEventListener("pointercancel", () => { dragging = false; });
  cv.addEventListener("keydown", (e) => {
    const k = e.key, s = 0.12;
    if (k === "ArrowLeft") R = mul3(rotM(0, -s), R); else if (k === "ArrowRight") R = mul3(rotM(0, s), R);
    else if (k === "ArrowUp") R = mul3(rotM(-s, 0), R); else if (k === "ArrowDown") R = mul3(rotM(s, 0), R);
    else if (k === "+" || k === "=") zoom = Math.min(zoom * 1.15, 3); else if (k === "-") zoom = Math.max(zoom / 1.15, 0.4);
    else return;
    e.preventDefault(); dirty = true; kick();
  });

  // controls
  $$("[data-src]").forEach((b) => b.addEventListener("click", () => {
    $$("[data-src]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    setSource(b.dataset.src); kick();
  }));
  $$("[data-ang]").forEach((b) => b.addEventListener("click", () => {
    sel = b.dataset.ang;
    $$("[data-ang]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    updateValue(); dirty = true; drawProfile(); kick();
  }));
  $("#tlOffset").addEventListener("input", (e) => { if (PSEUDO.has(sel)) return; offsets[sel] = +e.target.value; recompute(); kick(); });
  $("#tlNoise").addEventListener("input", (e) => { sigma = +e.target.value; $("#tlNoiseVal").textContent = "σ = " + sigma + "°"; recompute(); kick(); });
  $("#tlReseed").addEventListener("click", () => { reseed(); recompute(); kick(); });
  $("#tlResetAngles").addEventListener("click", () => {
    Object.keys(offsets).forEach((k) => (offsets[k] = 0)); sigma = 0;
    $("#tlNoise").value = 0; $("#tlNoiseVal").textContent = "σ = 0°"; recompute(); kick();
  });
  $("#tlBuild").addEventListener("click", () => { if (reduced) return; buildAnim = performance.now(); buildK = 3; kick(); });
  $("#tlSpin").addEventListener("click", (e) => { spin = !spin; e.target.setAttribute("aria-pressed", String(spin)); e.target.textContent = spin ? "Pause spin" : "Spin"; kick(); });

  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);
  reseed(); readColors(); setSource("trna");
  window.RNAGeom = { superpose }; // shared with the frame reconstruction demo
})();

// Frame-based reconstruction: a language model predicts one rigid frame (R, t) per nucleotide,
// an ideal nucleotide template is placed on each frame, and quality heads estimate RMSD, INF and TM-score
(function () {
  const D = window.FRAME_DATA, root = document.getElementById("flab");
  if (!D || !root) return;
  const $ = (s) => root.querySelector(s), $$ = (s) => Array.from(root.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cv = $("#flCanvas"), ctx = cv.getContext("2d");
  const n = D.res.length;

  // colours
  let col = {};
  const hex = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); const v = parseInt(h, 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; };
  const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ["a", "t", "g", "c", "fg", "muted", "bg"]) col[k] = hex(cs.getPropertyValue("--" + k).trim() || "#888");
    dirty = true;
  }
  const baseCol = (b) => col[{ A: "a", U: "t", G: "g", C: "c" }[b]];

  // small linear algebra
  const mv = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
  const mm = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  function axisAngle(ax, th) {
    const [x, y, z] = ax, c = Math.cos(th), s = Math.sin(th), C = 1 - c;
    return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]];
  }
  function toQuat(M) {
    const tr = M[0][0] + M[1][1] + M[2][2]; let w, x, y, z;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (M[2][1] - M[1][2]) / s; y = (M[0][2] - M[2][0]) / s; z = (M[1][0] - M[0][1]) / s; }
    else if (M[0][0] > M[1][1] && M[0][0] > M[2][2]) { const s = Math.sqrt(1 + M[0][0] - M[1][1] - M[2][2]) * 2; w = (M[2][1] - M[1][2]) / s; x = s / 4; y = (M[0][1] + M[1][0]) / s; z = (M[0][2] + M[2][0]) / s; }
    else if (M[1][1] > M[2][2]) { const s = Math.sqrt(1 + M[1][1] - M[0][0] - M[2][2]) * 2; w = (M[0][2] - M[2][0]) / s; x = (M[0][1] + M[1][0]) / s; y = s / 4; z = (M[1][2] + M[2][1]) / s; }
    else { const s = Math.sqrt(1 + M[2][2] - M[0][0] - M[1][1]) * 2; w = (M[1][0] - M[0][1]) / s; x = (M[0][2] + M[2][0]) / s; y = (M[1][2] + M[2][1]) / s; z = s / 4; }
    return [w, x, y, z];
  }
  function fromQuat([w, x, y, z]) {
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)], [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)], [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]];
  }
  function slerpId(q, t) { // slerp from the identity quaternion
    let [w, x, y, z] = q; if (w < 0) { w = -w; x = -x; y = -y; z = -z; }
    const th = Math.acos(Math.min(1, w)); if (th < 1e-6) return [1, 0, 0, 0];
    const a = Math.sin((1 - t) * th) / Math.sin(th), b = Math.sin(t * th) / Math.sin(th);
    return [a + b * w, b * x, b * y, b * z];
  }

  // native atoms, per-residue offsets, bonds from the templates
  const offs = []; let k = 0;
  D.res.forEach((r) => { offs.push(k); k += r.atoms.length; });
  const nat = D.native, nAtoms = nat.length;
  const bonds = [];
  D.res.forEach((r, i) => {
    const T = D.tmpl[r.b];
    for (let a = 0; a < r.atoms.length; a++) for (let b = a + 1; b < r.atoms.length; b++)
      if (dist(T[r.atoms[a]], T[r.atoms[b]]) < 1.75) bonds.push([offs[i] + a, offs[i] + b, i, isBase(r.atoms[a]) && isBase(r.atoms[b])]);
    if (i < n - 1) { const o3 = r.atoms.indexOf("O3'"), p = D.res[i + 1].atoms.indexOf("P"); if (o3 >= 0 && p >= 0) bonds.push([offs[i] + o3, offs[i + 1] + p, i, false]); }
  });
  function isBase(a) { return !a.includes("'") && !a.startsWith("P") && !a.startsWith("OP"); }
  const maxR = Math.max(...nat.map((p) => Math.hypot(...p)));

  // base pairs (same N1–N3 / wobble rule as the 3D viewer), for INF
  const pairCand = [];
  for (let i = 0; i < n; i++) for (let j = i + 4; j < n; j++) {
    const bi = D.res[i].b, bj = D.res[j].b, set = bi + bj;
    if (!["GC", "CG", "AU", "UA", "GU", "UG"].includes(set)) continue;
    const [pu, py] = "AG".includes(bi) ? [i, j] : [j, i];
    const tg = ["N3"].concat(set.includes("G") && set.includes("U") ? ["O2"] : []);
    pairCand.push([pu, py, tg]);
  }
  const atomIdx = (i, a) => { const j = D.res[i].atoms.indexOf(a); return j < 0 ? -1 : offs[i] + j; };
  function pairsOf(X) {
    const c = [];
    pairCand.forEach(([pu, py, tg]) => {
      const a = atomIdx(pu, "N1"); if (a < 0) return;
      let best = Infinity; tg.forEach((t) => { const b = atomIdx(py, t); if (b >= 0) best = Math.min(best, dist(X[a], X[b])); });
      if (best < 3.4) c.push([best, Math.min(pu, py), Math.max(pu, py)]);
    });
    c.sort((x, y) => x[0] - y[0]);
    const used = new Set(), out = new Set();
    c.forEach(([, i, j]) => { if (used.has(i) || used.has(j)) return; used.add(i); used.add(j); out.add(i + "-" + j); });
    return out;
  }
  const natPairs = pairsOf(nat);
  const c4 = D.res.map((_, i) => atomIdx(i, "C4'"));

  // seeded noise so the sliders rescale a fixed error pattern
  let seed = 11, noise = [];
  function reseed() {
    let s = (seed++ * 2654435761) >>> 0;
    const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    noise = D.res.map(() => { const ax = [g(), g(), g()], l = Math.hypot(...ax); return { ax: ax.map((v) => v / l), ang: g(), t: [g(), g(), g()] }; });
  }

  // state
  let mode = "3", sigR = 0, sigT = 0, showFrames = true, showAtoms = true;
  let frames = [], X = [], metrics = { rmsd: 0, inf: 1, tm: 1 };
  function computeFrames() {
    frames = D.res.map((r, i) => {
      let R = mode === "3" ? r.R3 : r.R4, t = mode === "3" ? r.t3 : r.t4;
      if (sigR || sigT) {
        const z = noise[i];
        R = mm(axisAngle(z.ax, z.ang * sigR * Math.PI / 180), R);
        t = add(t, z.t.map((v) => v * sigT / Math.sqrt(3)));
      }
      return { R, t, q: toQuat(R) };
    });
    // full-atom reconstruction at the final poses, for the metrics
    const full = [];
    D.res.forEach((r, i) => r.atoms.forEach((a) => full.push(add(mv(frames[i].R, D.tmpl[r.b][a]), frames[i].t))));
    const sp = window.RNAGeom ? window.RNAGeom.superpose(full, nat) : { X: full, rmsd: 0 };
    const L = n, d0 = Math.max(0.6 * Math.sqrt(L - 0.5) - 2.5, 0.5);
    let tm = 0; c4.forEach((ci) => { const d = dist(sp.X[ci], nat[ci]); tm += 1 / (1 + (d / d0) ** 2); });
    const pp = pairsOf(full); let tp = 0; pp.forEach((p) => { if (natPairs.has(p)) tp++; });
    const ppv = pp.size ? tp / pp.size : 0, sty = natPairs.size ? tp / natPairs.size : 0;
    metrics = { rmsd: sp.rmsd, tm: tm / L, inf: Math.sqrt(ppv * sty) };
    dirty = true;
  }

  // animation timeline (seconds): 1 tokens → LM, 2 frames fly to their poses, 3 atoms appear, 4 quality heads
  const T_LM = 1.4, T_FLY = 3.2, T_ATOM = 1.0, T_Q = 0.9, T_END = T_LM + T_FLY + T_ATOM + T_Q;
  let tl = T_END, playing = 0;
  const clamp = (x) => Math.min(Math.max(x, 0), 1), ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const flyOf = (i) => ease(clamp((tl - T_LM - (i / n) * T_FLY * 0.55) / (T_FLY * 0.45)));
  const atomA = () => clamp((tl - T_LM - T_FLY) / T_ATOM);
  const qualA = () => clamp((tl - T_LM - T_FLY - T_ATOM) / T_Q);

  const stepEls = $$("[data-step]"), tokEls = [];
  const strip = $("#flTokens");
  D.seq.split("").forEach((b) => { const s = document.createElement("span"); s.className = "ftok " + b; s.textContent = b; strip.appendChild(s); tokEls.push(s); });
  function syncDom() {
    const stage = tl < 0.5 ? 1 : tl < T_LM ? 2 : tl < T_LM + T_FLY ? 3 : tl < T_LM + T_FLY + T_ATOM ? 4 : 5;
    stepEls.forEach((el) => { const s = +el.dataset.step; el.classList.toggle("on", s === stage); el.classList.toggle("done", s < stage || tl >= T_END); });
    const lm = clamp(tl / T_LM);
    tokEls.forEach((el, i) => { el.classList.toggle("read", i / n < lm); el.classList.toggle("placed", flyOf(i) >= 1); });
    const q = ease(qualA());
    $("#flRmsd").textContent = (metrics.rmsd * q).toFixed(2) + " Å";
    $("#flInf").textContent = (metrics.inf * q).toFixed(2);
    $("#flTm").textContent = (metrics.tm * q).toFixed(2);
    root.style.setProperty("--qa", q.toFixed(3));
  }

  // view
  let V = mm(rot(0, 0.9), rot(-0.35, 0)), zoom = 1, W = 0, H = 0, dpr = 1, spin = !reduced, drag = false, last = null, visible = false, loop = false, dirty = true;
  function rot(ax, ay) {
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
    return mm([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]);
  }
  function resize() { const r = cv.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; dirty = true; }
  new ResizeObserver(resize).observe(cv);

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (!W) return;
    const fit = Math.min(W, H) * 0.44 / maxR * zoom, Dc = maxR * 4;
    const pr = (p) => { const q = mv(V, p), s = Dc / (Dc + q[2]); return [W / 2 + q[0] * fit * s, H / 2 - q[1] * fit * s, q[2], s]; };
    const depth = (z) => clamp((z + maxR) / (2 * maxR)) * 0.6;
    // current pose of each frame: from an identity frame on a straight line to its predicted pose
    const poses = frames.map((f, i) => {
      const e = flyOf(i), cols = 10, start = [((i % cols) - (cols - 1) / 2) * 7, (Math.floor(n / cols) / 2 - Math.floor(i / cols)) * 7, 0]; // unplaced frames wait on a grid
      return { R: e >= 1 ? f.R : fromQuat(slerpId(f.q, e)), t: [0, 1, 2].map((d) => start[d] + (f.t[d] - start[d]) * e), e };
    });
    const items = [];
    const aA = atomA();
    if (showAtoms && aA > 0) {
      const P = [];
      D.res.forEach((r, i) => r.atoms.forEach((a) => P.push(pr(add(mv(poses[i].R, D.tmpl[r.b][a]), poses[i].t)))));
      bonds.forEach(([a, b, i, base]) => items.push({ z: (P[a][2] + P[b][2]) / 2, k: 0, a: P[a], b: P[b], c: base ? baseCol(D.res[i].b) : mix(col.fg, col.muted, 0.4), w: base ? 2.2 : 1.8 }));
    }
    if (showFrames) {
      const L = 3.6;
      poses.forEach((p, i) => {
        const o = pr(p.t);
        [["a", 0], ["c", 1], ["t", 2]].forEach(([c, ax]) => {
          const tip = pr(add(p.t, [p.R[0][ax] * L, p.R[1][ax] * L, p.R[2][ax] * L]));
          items.push({ z: (o[2] + tip[2]) / 2 - 0.05, k: 0, a: o, b: tip, c: col[c], w: 2.6, alpha: aA > 0 ? 1 - aA * 0.45 : 1 });
        });
        items.push({ z: o[2] - 0.06, k: 1, a: o, c: col.fg, alpha: aA > 0 ? 1 - aA * 0.45 : 1 });
      });
    }
    items.sort((x, y) => y.z - x.z);
    ctx.lineCap = "round";
    for (const it of items) {
      const f = depth(it.z), c = mix(it.c, col.bg, f);
      if (it.k === 0) { ctx.strokeStyle = rgb(c, it.alpha == null ? aA : it.alpha); ctx.lineWidth = Math.max(1, it.w * it.a[3] * zoom); ctx.beginPath(); ctx.moveTo(it.a[0], it.a[1]); ctx.lineTo(it.b[0], it.b[1]); ctx.stroke(); }
      else { ctx.fillStyle = rgb(c, it.alpha); ctx.beginPath(); ctx.arc(it.a[0], it.a[1], Math.max(1.6, 2.4 * it.a[3] * zoom), 0, 7); ctx.fill(); }
    }
  }

  function frame(now) {
    if (!visible) { loop = false; return; }
    if (playing) {
      tl = Math.min((now - playing) / 1000, T_END);
      if (tl >= T_END) playing = 0;
      syncDom(); dirty = true;
    }
    if (spin && !drag) { V = mm(rot(0, 0.004), V); dirty = true; }
    if (dirty) { draw(); dirty = false; }
    requestAnimationFrame(frame);
  }
  const kick = () => { if (!loop && visible) { loop = true; requestAnimationFrame(frame); } };
  let autoplayed = false;
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting; kick();
    if (visible && !autoplayed && !reduced) { autoplayed = true; play(); }
  }, { threshold: 0.35 }).observe(cv);
  function play() { if (reduced) { tl = T_END; syncDom(); dirty = true; kick(); return; } tl = 0; playing = performance.now(); kick(); }

  cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); drag = true; last = [e.clientX, e.clientY]; });
  cv.addEventListener("pointermove", (e) => { if (!drag) return; V = mm(rot((e.clientY - last[1]) * 0.01, (e.clientX - last[0]) * 0.01), V); last = [e.clientX, e.clientY]; dirty = true; kick(); });
  cv.addEventListener("pointerup", () => (drag = false));
  cv.addEventListener("pointercancel", () => (drag = false));
  cv.addEventListener("keydown", (e) => {
    const s = 0.12, key = e.key;
    if (key === "ArrowLeft") V = mm(rot(0, -s), V); else if (key === "ArrowRight") V = mm(rot(0, s), V);
    else if (key === "ArrowUp") V = mm(rot(-s, 0), V); else if (key === "ArrowDown") V = mm(rot(s, 0), V);
    else if (key === "+" || key === "=") zoom = Math.min(zoom * 1.15, 3); else if (key === "-") zoom = Math.max(zoom / 1.15, 0.5);
    else return;
    e.preventDefault(); dirty = true; kick();
  });

  // controls
  $("#flPlay").addEventListener("click", play);
  const modeB = $$("[data-fmode]");
  modeB.forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.fmode; modeB.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("#flAtoms").textContent = mode === "3" ? "P · C4′ · N1/N9  (Gram-Schmidt)" : "P · C4′ · C1′ · N1/N9  (least-squares fit)";
    computeFrames(); syncDom(); kick();
  }));
  const vb = $$("[data-fview]");
  vb.forEach((b) => b.addEventListener("click", () => {
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    if (b.dataset.fview === "frames") showFrames = on; else showAtoms = on;
    dirty = true; kick();
  }));
  $("#flRot").addEventListener("input", (e) => { sigR = +e.target.value; $("#flRotV").textContent = sigR + "°"; computeFrames(); syncDom(); kick(); });
  $("#flTr").addEventListener("input", (e) => { sigT = +e.target.value / 10; $("#flTrV").textContent = sigT.toFixed(1) + " Å"; computeFrames(); syncDom(); kick(); });
  $("#flReseed").addEventListener("click", () => { reseed(); computeFrames(); syncDom(); kick(); });
  $("#flSpin").addEventListener("click", (e) => { spin = !spin; e.target.setAttribute("aria-pressed", String(spin)); e.target.textContent = spin ? "Pause spin" : "Spin"; kick(); });

  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);
  reseed(); readColors(); computeFrames(); syncDom();
})();

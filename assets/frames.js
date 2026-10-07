// Thesis chapter 6: sequence → language model → Pairformer → Structure Module predicting one rigid frame (R, t)
// per nucleotide from a black-hole initialisation, with recycling → coarse-grained atoms → all-atom (Arena in the thesis).
// Also draws the modality comparison chart (thesis Table 6.2).
(function () {
  const D = window.FRAME_DATA, root = document.getElementById("flab");
  if (!D || !root) return;
  const T = (s) => (window.I18N ? window.I18N.t(s) : s);
  const $ = (s) => root.querySelector(s), $$ = (s) => Array.from(root.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cv = $("#flCanvas"), ctx = cv.getContext("2d");
  const n = D.bases.length;

  // colours
  let col = {};
  const hex = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); const v = parseInt(h, 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; };
  const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ["a", "t", "g", "c", "fg", "muted", "bg", "line"]) col[k] = hex(cs.getPropertyValue("--" + k).trim() || "#888");
    dirty = true;
  }
  const baseCol = (b) => col[{ A: "a", U: "t", G: "g", C: "c" }[b]];
  const lddtCol = (v) => mix(mix(col.line, col.muted, 0.3), col.t, Math.max(0, Math.min(1, v))); // one hue, light → dark

  // linear algebra
  const mv = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
  const mm = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
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
  function slerpId(q, t) {
    let [w, x, y, z] = q; if (w < 0) { w = -w; x = -x; y = -y; z = -z; }
    const th = Math.acos(Math.min(1, w)); if (th < 1e-6) return [1, 0, 0, 0];
    const a = Math.sin((1 - t) * th) / Math.sin(th), b = Math.sin(t * th) / Math.sin(th);
    return [a + b * w, b * x, b * y, b * z];
  }

  // atoms, bonds, base pairs (shared across representations)
  const offs = []; let k = 0;
  D.atoms.forEach((list) => { offs.push(k); k += list.length; });
  const nat = D.native;
  const isBase = (a) => !a.includes("'") && !a.startsWith("P") && !a.startsWith("OP");
  const atomIdx = (i, a) => { const j = D.atoms[i].indexOf(a); return j < 0 ? -1 : offs[i] + j; };
  const glyN = (b) => ("AG".includes(b) ? "N9" : "N1");
  const maxR = Math.max(...nat.map((p) => Math.hypot(...p)));
  const c4 = D.bases.map((_, i) => atomIdx(i, "C4'"));
  let bonds = [];
  function buildBonds(T) {
    bonds = [];
    D.atoms.forEach((list, i) => {
      const tm = T[D.bases[i]];
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++)
        if (dist(tm[list[a]], tm[list[b]]) < 1.75) bonds.push([offs[i] + a, offs[i] + b, i, isBase(list[a]) && isBase(list[b])]);
      if (i < n - 1) { const o3 = atomIdx(i, "O3'"), p = atomIdx(i + 1, "P"); if (o3 >= 0 && p >= 0) bonds.push([o3, p, i, false]); }
    });
  }
  const pairCand = [];
  for (let i = 0; i < n; i++) for (let j = i + 4; j < n; j++) {
    const bi = D.bases[i], bj = D.bases[j], set = bi + bj;
    if (!["GC", "CG", "AU", "UA", "GU", "UG"].includes(set)) continue;
    const [pu, py] = "AG".includes(bi) ? [i, j] : [j, i];
    pairCand.push([pu, py, ["N3"].concat(set.includes("G") && set.includes("U") ? ["O2"] : [])]);
  }
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
  // per-nucleotide lDDT on the C4′ trace (15 Å inclusion radius, 0.5/1/2/4 Å thresholds): what the pLDDT head learns to predict
  const nbr = c4.map((ci, i) => c4.map((cj, j) => (j !== i && dist(nat[ci], nat[cj]) < 15 ? j : -1)).filter((j) => j >= 0));
  function lddt(X) {
    return c4.map((ci, i) => {
      let s = 0; nbr[i].forEach((j) => { const d = Math.abs(dist(X[ci], X[c4[j]]) - dist(nat[ci], nat[c4[j]])); s += [0.5, 1, 2, 4].filter((t) => d < t).length / 4; });
      return nbr[i].length ? s / nbr[i].length : 1;
    });
  }

  // seeded noise: user-set prediction error, plus the intermediate error of earlier recycling steps
  let seed = 11, noise = [], wobble = [];
  function reseed() {
    let s = (seed++ * 2654435761) >>> 0;
    const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    const one = () => { const ax = [g(), g(), g()], l = Math.hypot(...ax); return { ax: ax.map((v) => v / l), ang: g(), t: [g(), g(), g()] }; };
    noise = D.bases.map(one); wobble = D.bases.map(one);
  }

  // state
  let rep = "nufold", sigR = 0, sigT = 0, showFrames = true, showAtoms = true, colorBy = "nuc";
  let frames = [], full = [], lddtRes = [], metrics = { rmsd: 0, inf: 1, tm: 1, lddt: 1 };
  const REPS = { deepfold: "DeepFoldRNA / DrFold", nufold: "NuFold", rhofold: "RhoFold", custom: "Custom", reduced: "Custom reduced" };
  function computeFrames() {
    const R = D.reps[rep];
    frames = R.res.map((f, i) => {
      let Rm = f.R, t = f.t;
      if (sigR || sigT) { const z = noise[i]; Rm = mm(axisAngle(z.ax, z.ang * sigR * Math.PI / 180), Rm); t = add(t, z.t.map((v) => v * sigT / Math.sqrt(3))); }
      return { R: Rm, t, q: toQuat(Rm) };
    });
    full = [];
    D.atoms.forEach((list, i) => list.forEach((a) => full.push(add(mv(frames[i].R, R.tmpl[D.bases[i]][a]), frames[i].t))));
    const sp = window.RNAGeom ? window.RNAGeom.superpose(full, nat) : { X: full, rmsd: 0 };
    const d0 = Math.max(0.6 * Math.sqrt(n - 0.5) - 2.5, 0.5);
    let tm = 0; c4.forEach((ci) => { const d = dist(sp.X[ci], nat[ci]); tm += 1 / (1 + (d / d0) ** 2); });
    const pp = pairsOf(full); let tp = 0; pp.forEach((p) => { if (natPairs.has(p)) tp++; });
    const ppv = pp.size ? tp / pp.size : 0, sty = natPairs.size ? tp / natPairs.size : 0;
    lddtRes = lddt(full);
    metrics = { rmsd: sp.rmsd, tm: tm / n, inf: Math.sqrt(ppv * sty), lddt: lddtRes.reduce((a, b) => a + b, 0) / n };
    buildBonds(R.tmpl);
    $("#flAtoms").textContent = R.frameAtoms.map((a) => (a === "N" ? "N1/N9" : a.replace("'", "′"))).join(" · ") + (R.frameAtoms.length === 4 ? "  " + T("(4 atoms, least-squares fit)") : "  " + T("(3 atoms, Gram-Schmidt)"));
    dirty = true;
  }

  // ---------- timeline (seconds) ----------
  // 1 sequence · 2 RNAEmbedder (tokens → embeddings → pair representation) · 3 Pairformer (pair map sharpens)
  // 4 Structure Module: 3 recycles out of the black hole · 5 coarse-grained frame atoms · 6 all-atom · then evaluation
  const DUR = [1.4, 2.0, 2.2, 3 * 1.8, 1.6, 1.6, 1.0];
  const START = DUR.reduce((a, d, i) => (a.push(a[i] + d), a), [0]); // START[s] = start of step s+1 (index 6 = evaluation)
  const T_END = START[7], REC = DUR[3] / 3;
  let tl = T_END, playing = false, lastNow = 0;
  const clamp = (x) => Math.min(Math.max(x, 0), 1), ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const stepAt = (t) => { for (let s = 6; s >= 0; s--) if (t >= START[s]) return s; return 0; };
  const local = (s) => clamp((tl - START[s]) / DUR[s]);
  const HOPS = [[0, 0], [0.6, 0.32], [0.9, 0.1], [1, 0]]; // [fraction of the final pose, remaining error] after each recycle
  function hopState(i) {
    const u = (tl - START[3]) / REC;
    if (u <= 0) return { f: 0, w: 0 };
    if (u >= 3) return { f: 1, w: 0 };
    const h = Math.floor(u), e = ease(clamp((u - h) * 1.2 - (i / n) * 0.2));
    const [f0, w0] = HOPS[h], [f1, w1] = HOPS[h + 1];
    return { f: f0 + (f1 - f0) * e, w: w0 + (w1 - w0) * e };
  }

  // native C4′ distance map: what the pair representation should come to encode
  const dmap = c4.map((a) => c4.map((b) => dist(nat[a], nat[b])));
  let pnoise = [], emb = [];
  function pairNoise() {
    let s = 99; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    emb = D.bases.map(() => Array.from({ length: 6 }, r));
    pnoise = c4.map((_, i) => c4.map((_, j) => (emb[i][j % 6] + emb[j][i % 6]) / 2));
  }
  pairNoise();

  // poses of the frames at the current time
  function poses() {
    return frames.map((f, i) => {
      const { f: e, w } = hopState(i);
      let Rm = e >= 1 && w === 0 ? f.R : fromQuat(slerpId(f.q, e)), t = scl(f.t, e);
      if (w > 0) { const z = wobble[i]; Rm = mm(axisAngle(z.ax, z.ang * w * 0.6), Rm); t = add(t, scl(z.t, w * 3)); }
      return { R: Rm, t };
    });
  }
  // FAPE on frame origins (AlphaFold 2 style: express every point in every frame, clamp at 10 Å, divide by 10)
  function fape(P) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const Ri = P[i].R, ti = P[i].t, Rt = frames[i].R, tt = frames[i].t;
      for (let j = 0; j < n; j++) {
        const a = [P[j].t[0] - ti[0], P[j].t[1] - ti[1], P[j].t[2] - ti[2]], b = [frames[j].t[0] - tt[0], frames[j].t[1] - tt[1], frames[j].t[2] - tt[2]];
        const la = [Ri[0][0] * a[0] + Ri[1][0] * a[1] + Ri[2][0] * a[2], Ri[0][1] * a[0] + Ri[1][1] * a[1] + Ri[2][1] * a[2], Ri[0][2] * a[0] + Ri[1][2] * a[1] + Ri[2][2] * a[2]];
        const lb = [Rt[0][0] * b[0] + Rt[1][0] * b[1] + Rt[2][0] * b[2], Rt[0][1] * b[0] + Rt[1][1] * b[1] + Rt[2][1] * b[2], Rt[0][2] * b[0] + Rt[1][2] * b[1] + Rt[2][2] * b[2]];
        s += Math.min(10, Math.sqrt((la[0] - lb[0]) ** 2 + (la[1] - lb[1]) ** 2 + (la[2] - lb[2]) ** 2 + 1e-4));
      }
    }
    return s / (n * n) / 10;
  }

  // ---------- DOM sync ----------
  const stepEls = $$("[data-step]"), statusEl = $("#flRecycle"), scrub = $("#flScrub"), playB = $("#flPlay");
  const STATUS = [
    "1 · The RNA sequence, one token per nucleotide",
    "2 · RNAEmbedder: the language model turns each token into an embedding, then builds a pair representation",
    "3 · Pairformer: triangle attention refines the pair representation (shown here as the C4′ distance map it learns)",
    "", // structure module, filled in live
    "5 · Coarse-grained model: the frame atoms of each nucleotide",
    "6 · All-atom structure (Arena in the thesis, rigid nucleotides here)",
    "Evaluation against the crystal structure",
  ];
  let curFape = 0;
  function syncDom() {
    const s = stepAt(tl), done = tl >= T_END;
    stepEls.forEach((el) => { const k = +el.dataset.step - 1; el.classList.toggle("on", k === s && !done); el.classList.toggle("done", k < s || done); el.setAttribute("aria-current", k === s && !done ? "step" : "false"); });
    root.classList.toggle("in3d", s >= 3);
    if (s === 3) { curFape = fape(poses()); const u = (tl - START[3]) / REC; statusEl.textContent = u < 0.08 ? T("4 · Structure Module: black-hole initialisation, every frame at the origin (R = I, t = 0)") : `4 · ${T("Structure Module · recycle")} ${Math.min(3, Math.floor(u) + 1)} / 3 · FAPE ${curFape.toFixed(2)}`; }
    else statusEl.textContent = done ? T("Done. Drag to rotate, or change the representation, colours and errors") : T(STATUS[s]);
    const pending = playing && tl < START[6], q = playing ? ease(local(6)) : 1;
    const show = (id, v, unit = "") => ($(id).textContent = pending ? "…" : (v * q).toFixed(2) + unit);
    show("#flRmsd", metrics.rmsd, " Å"); show("#flInf", metrics.inf); show("#flTm", metrics.tm); show("#flLddt", metrics.lddt);
    root.style.setProperty("--qa", pending ? "0" : "1");
    scrub.value = Math.round((tl / T_END) * 1000);
    playB.textContent = playing ? T("❚❚ Pause") : done ? T("↻ Replay") : T("▶ Play");
    playB.setAttribute("aria-pressed", String(playing));
  }

  // ---------- view ----------
  let V = mm(rot(0, 0.9), rot(-0.35, 0)), zoom = 1, W = 0, H = 0, dpr = 1, spin = !reduced, drag = false, last = null, visible = false, loop = false, dirty = true;
  let camR = maxR; // camera radius, follows the extent of the frames so the black hole is readable
  function rot(ax, ay) {
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
    return mm([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]);
  }
  function resize() { const r = cv.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; dirty = true; }
  new ResizeObserver(resize).observe(cv);

  function drawPair(alpha) { // steps 1–3 drawn flat: tokens, embeddings, pair representation
    const s = stepAt(tl), pad = 18, tokW = Math.min(9, (W - 2 * pad) / n), x0 = (W - tokW * n) / 2, yTok = 30;
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${Math.max(6, tokW - 1)}px 'JetBrains Mono', monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const read = s === 0 ? local(0) : 1;
    for (let i = 0; i < n; i++) {
      const on = i / n < read, x = x0 + i * tokW;
      ctx.fillStyle = rgb(on ? baseCol(D.bases[i]) : col.line); ctx.fillRect(x + 0.5, yTok, tokW - 1, tokW + 3);
      if (tokW >= 7) { ctx.fillStyle = on ? "#fff" : rgb(col.muted); ctx.fillText(D.bases[i], x + tokW / 2, yTok + (tokW + 3) / 2); }
    }
    if (s >= 1) { // embeddings: a column of features under each token
      const e = s === 1 ? clamp(local(1) / 0.45) : 1, y = yTok + tokW + 10;
      for (let i = 0; i < n; i++) {
        if (i / n > e) break;
        for (let k = 0; k < 6; k++) { ctx.fillStyle = rgb(mix(col.bg, col.t, 0.25 + emb[i][k] * 0.75)); ctx.fillRect(x0 + i * tokW + 0.5, y + k * 4, tokW - 1, 3); }
      }
    }
    if (s >= 1) { // pair representation L × L: noisy outer product, then sharpened by the Pairformer
      const appear = s === 1 ? clamp((local(1) - 0.4) / 0.5) : 1, sharp = s === 1 ? 0 : s === 2 ? ease(local(2)) : 1;
      const yM = yTok + tokW + 44, size = Math.min(W - 2 * pad, H - yM - 40), cell = size / n, xM = (W - size) / 2;
      ctx.globalAlpha = alpha * appear;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const v = (1 - sharp) * pnoise[i][j] * 0.55 + sharp * Math.exp(-dmap[i][j] / 9);
        ctx.fillStyle = rgb(mix(col.bg, col.t, Math.min(1, v * 1.1)));
        ctx.fillRect(xM + j * cell, yM + i * cell, cell + 0.3, cell + 0.3);
      }
      ctx.globalAlpha = alpha * appear;
      ctx.font = "600 10px 'JetBrains Mono', monospace"; ctx.fillStyle = rgb(col.muted); ctx.textAlign = "left";
      ctx.fillText(s >= 2 ? T("pair representation → C4′ distance map") : T("pair representation (L × L)"), xM, yM + size + 14);
    }
    ctx.globalAlpha = 1; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (!W) return;
    const s = stepAt(tl);
    // 2D model view for steps 1–3, cross-fading into the 3D view at the start of step 4
    const fade3d = s < 3 ? 0 : clamp((tl - START[3]) / 0.5);
    if (s < 3 || fade3d < 1) drawPair(1 - fade3d);
    if (s < 3) return;
    const P = poses(), Rp = D.reps[rep];
    const ext = Math.max(8, ...P.map((p) => Math.hypot(...p.t))) + 6;
    camR += (Math.min(maxR, ext) - camR) * (playing ? 0.12 : 1);
    const fit = Math.min(W, H) * 0.42 / camR * zoom, Dc = maxR * 4;
    const pr = (p) => { const q = mv(V, p), sc = Dc / (Dc + q[2]); return [W / 2 + q[0] * fit * sc, H / 2 + 10 - q[1] * fit * sc, q[2], sc]; };
    const depth = (z) => clamp((z + camR) / (2 * camR)) * 0.55;
    const res = (i) => (colorBy === "lddt" ? lddtCol(lddtRes[i]) : baseCol(D.bases[i]));
    const items = [], cg = clamp((tl - START[4]) / 0.8), aa = clamp((tl - START[5]) / 0.9);
    ctx.globalAlpha = fade3d;
    // backbone trace through the frame origins, so the fold is readable before atoms appear
    if (aa < 1) for (let i = 0; i < n - 1; i++) {
      const a = pr(P[i].t), b = pr(P[i + 1].t);
      items.push({ z: (a[2] + b[2]) / 2 + 0.02, k: 0, a, b, c: mix(col.fg, col.muted, 0.5), w: 1.6, al: 0.55 * (1 - aa) });
    }
    if (showAtoms && aa > 0) {
      const X = [];
      D.atoms.forEach((list, i) => list.forEach((a) => X.push(pr(add(mv(P[i].R, Rp.tmpl[D.bases[i]][a]), P[i].t)))));
      bonds.forEach(([a, b, i, base]) => items.push({ z: (X[a][2] + X[b][2]) / 2, k: 0, a: X[a], b: X[b], c: base || colorBy === "lddt" ? res(i) : mix(col.fg, col.muted, 0.4), w: base ? 2.2 : 1.8, al: aa }));
    }
    if (showAtoms && cg > 0) P.forEach((p, i) => Rp.frameAtoms.forEach((a) => {
      const nm = a === "N" ? glyN(D.bases[i]) : a, o = pr(add(mv(p.R, Rp.tmpl[D.bases[i]][nm]), p.t));
      items.push({ z: o[2] - 0.03, k: 1, a: o, c: res(i), r: 4, al: cg * (1 - aa * 0.7) });
    }));
    if (showFrames) {
      const L = 3.6, fa = 1 - aa * 0.6;
      P.forEach((p) => {
        const o = pr(p.t);
        [["a", 0], ["c", 1], ["t", 2]].forEach(([c, ax]) => {
          const tip = pr(add(p.t, [p.R[0][ax] * L, p.R[1][ax] * L, p.R[2][ax] * L]));
          items.push({ z: (o[2] + tip[2]) / 2 - 0.05, k: 0, a: o, b: tip, c: col[c], w: 2.6, al: fa });
        });
      });
    }
    items.sort((x, y) => y.z - x.z);
    ctx.lineCap = "round";
    for (const it of items) {
      const c = mix(it.c, col.bg, depth(it.z));
      if (it.k === 0) { ctx.strokeStyle = rgb(c, it.al); ctx.lineWidth = Math.max(1, it.w * it.a[3] * Math.min(zoom * maxR / camR, 2.2)); ctx.beginPath(); ctx.moveTo(it.a[0], it.a[1]); ctx.lineTo(it.b[0], it.b[1]); ctx.stroke(); }
      else { ctx.fillStyle = rgb(c, it.al); ctx.beginPath(); ctx.arc(it.a[0], it.a[1], Math.max(1.8, it.r * it.a[3] * zoom), 0, 7); ctx.fill(); }
    }
    const u = (tl - START[3]) / REC;
    if (s === 3 && u < 0.6) { // mark the black hole
      const o = pr([0, 0, 0]), a = 1 - clamp(u / 0.6);
      ctx.strokeStyle = rgb(col.fg, 0.55 * a); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(o[0], o[1], 26, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = rgb(col.fg, 0.8 * a); ctx.font = "600 11px 'JetBrains Mono', monospace"; ctx.fillText(T("black hole: R = I, t = 0"), o[0] + 32, o[1] - 20);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- loop ----------
  function frame(now) {
    if (!visible) { loop = false; return; }
    const dt = lastNow ? Math.min((now - lastNow) / 1000, 0.1) : 0; lastNow = now;
    if (playing) {
      tl = Math.min(tl + dt, T_END);
      if (tl >= T_END) playing = false;
      syncDom(); dirty = true;
    }
    if (spin && !drag && !playing && tl >= START[3]) { V = mm(rot(0, 0.004), V); dirty = true; } // keep the view still while the pipeline plays
    if (dirty) { draw(); dirty = false; }
    requestAnimationFrame(frame);
  }
  const kick = () => { if (!loop && visible) { loop = true; lastNow = 0; requestAnimationFrame(frame); } };
  function play(from, auto) {
    if (auto && reduced) { tl = T_END; playing = false; syncDom(); dirty = true; kick(); return; } // a click always plays
    if (from != null) tl = from; else if (tl >= T_END) tl = 0;
    playing = true; syncDom(); kick();
  }
  function pause() { playing = false; syncDom(); }
  function toResult() { if (tl < T_END || playing) { playing = false; tl = T_END; camR = maxR; } }
  function seek(t) { tl = Math.min(Math.max(t, 0), T_END); camR = maxR; syncDom(); dirty = true; kick(); }
  let autoplayed = false, autoPaused = false;
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (en.intersectionRatio >= 0.3) {
      if (!autoplayed) { autoplayed = true; play(0, true); }
      else if (autoPaused) { autoPaused = false; play(); } // resume where it stopped when scrolled away
    }
    if (!en.isIntersecting && playing) { autoPaused = true; pause(); } // don't run unseen
    kick();
  }, { threshold: [0, 0.3] }).observe(cv);

  cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); drag = true; last = [e.clientX, e.clientY]; });
  cv.addEventListener("pointermove", (e) => { if (!drag) return; V = mm(rot((e.clientY - last[1]) * 0.01, (e.clientX - last[0]) * 0.01), V); last = [e.clientX, e.clientY]; dirty = true; kick(); });
  cv.addEventListener("pointerup", () => (drag = false));
  cv.addEventListener("pointercancel", () => (drag = false));
  cv.addEventListener("keydown", (e) => {
    const s = 0.12, key = e.key;
    if (key === "ArrowLeft") V = mm(rot(0, -s), V); else if (key === "ArrowRight") V = mm(rot(0, s), V);
    else if (key === "ArrowUp") V = mm(rot(-s, 0), V); else if (key === "ArrowDown") V = mm(rot(s, 0), V);
    else if (key === "+" || key === "=") zoom = Math.min(zoom * 1.15, 3); else if (key === "-") zoom = Math.max(zoom / 1.15, 0.5);
    else if (key === " ") { playing ? pause() : play(); }
    else return;
    e.preventDefault(); dirty = true; kick();
  });

  // ---------- controls ----------
  const press = (group, b) => group.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  playB.addEventListener("click", () => { autoPaused = false; playing ? pause() : play(); });
  scrub.addEventListener("input", () => { const t = (scrub.value / 1000) * T_END; playing = false; seek(t); }); // read before syncDom rewrites the slider
  stepEls.forEach((el) => {
    const go = () => { const k = +el.dataset.step - 1; play(START[k]); };
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
  const repB = $$("[data-frep]");
  repB.forEach((b) => b.addEventListener("click", () => { rep = b.dataset.frep; press(repB, b); toResult(); computeFrames(); syncDom(); kick(); }));
  const colB = $$("[data-fcol]");
  colB.forEach((b) => b.addEventListener("click", () => {
    colorBy = b.dataset.fcol; press(colB, b); root.dataset.color = colorBy;
    if (colorBy === "lddt") { showFrames = false; $('[data-fview="frames"]').setAttribute("aria-pressed", "false"); } // frame axes would clash with the lDDT ramp
    dirty = true; kick();
  }));
  $$("[data-fview]").forEach((b) => b.addEventListener("click", () => {
    const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on));
    if (b.dataset.fview === "frames") showFrames = on; else showAtoms = on;
    dirty = true; kick();
  }));
  $("#flRot").addEventListener("input", (e) => { sigR = +e.target.value; $("#flRotV").textContent = sigR + "°"; toResult(); computeFrames(); syncDom(); kick(); });
  $("#flTr").addEventListener("input", (e) => { sigT = +e.target.value / 10; $("#flTrV").textContent = sigT.toFixed(1) + " Å"; toResult(); computeFrames(); syncDom(); kick(); });
  $("#flReseed").addEventListener("click", () => { reseed(); toResult(); computeFrames(); syncDom(); kick(); });
  $("#flSpin").addEventListener("click", (e) => { spin = !spin; e.target.setAttribute("aria-pressed", String(spin)); e.target.textContent = spin ? T("Pause spin") : T("Spin"); kick(); });

  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);
  reseed(); readColors(); computeFrames(); syncDom();
  document.addEventListener("langchange", () => { computeFrames(); syncDom(); const b = $("#flSpin"); b.textContent = spin ? T("Pause spin") : T("Spin"); dirty = true; kick(); });
})();

// Modality comparison (thesis Table 6.2): reconstruction from the TRUE values of each modality, then Arena to all-atom,
// on RNA-Puzzles, CASP-RNA and RNASolo. Mean ± standard deviation.
(function () {
  const box = document.getElementById("modChart");
  if (!box) return;
  const T = (s) => (window.I18N ? window.I18N.t(s) : s);
  const MODS = ["Frames (NuFold)", "Torsion angles", "Torsion angles, constant bond angles", "Distances, discretised", "Distances"];
  const M = {
    rmsd: { label: "RMSD", unit: " Å", better: "lower", v: [[0.82, 0.17], [2.86, 4.53], [9.52, 7.15], [10.71, 8.2], [10.39, 8.86]] },
    inf: { label: "INF", unit: "", better: "higher", v: [[0.87, 0.11], [0.81, 0.09], [0.61, 0.1], [0.47, 0.23], [0.52, 0.23]] },
    tm: { label: "TM-score", unit: "", better: "higher", v: [[0.97, 0.03], [0.96, 0.1], [0.49, 0.12], [0.54, 0.35], [0.6, 0.4]] },
    mcq: { label: "MCQ", unit: "°", better: "lower", v: [[19.84, 5.67], [6.24, 2.78], [7.4, 2.83], [36.3, 12.07], [33.18, 9.17]] },
    clash: { label: "Clash score", unit: "", better: "lower", v: [[35.17, 16.84], [94.52, 94.56], [132.36, 70.65], [145.72, 105.18], [92.4, 21.64]] },
  };
  const svg = box.querySelector("svg"), tip = box.querySelector(".mc-tip"), note = box.querySelector(".mc-note"), table = box.querySelector("table");
  let key = "rmsd";
  const fmt = (x) => (x >= 10 ? x.toFixed(1) : x.toFixed(2));
  function render() {
    const m = M[key], w = svg.clientWidth || 600, narrow = w < 560, rowH = narrow ? 46 : 34, padL = narrow ? 4 : 230, padR = 64, top = 6, h = top + rowH * MODS.length + 22; // narrow: labels above bars
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("height", h);
    const raw = Math.max(...m.v.map(([a, s]) => a + s)), mag = Math.pow(10, Math.floor(Math.log10(raw / 4)));
    const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((st) => raw / st <= 5), max = Math.ceil(raw / step) * step;
    const x = (v) => padL + (v / max) * (w - padL - padR);
    const best = m.v.reduce((b, [a], i) => ((m.better === "lower" ? a < m.v[b][0] : a > m.v[b][0]) ? i : b), 0);
    let g = "";
    for (let v = 0; v <= max + 1e-9; v += step) { const xv = x(v); g += `<line x1="${xv}" x2="${xv}" y1="${top}" y2="${h - 18}" class="mc-grid"/><text x="${xv}" y="${h - 4}" class="mc-ax" text-anchor="middle">${+v.toFixed(3)}</text>`; }
    m.v.forEach(([a, s], i) => {
      const y = top + i * rowH, bh = 14, cy = narrow ? y + 30 : y + rowH / 2, x0 = x(0), x1 = x(a), lo = x(Math.max(0, a - s)), hi = x(a + s);
      const cls = i === 0 ? "mc-bar hl" : "mc-bar";
      g += `<g class="mc-row" data-i="${i}"><rect class="mc-hit" x="0" y="${y}" width="${w}" height="${rowH}"/>`
        + (narrow ? `<text x="${padL}" y="${y + 14}" class="mc-lbl${i === 0 ? " hl" : ""}">${T(MODS[i])}</text>` : `<text x="${padL - 10}" y="${cy + 4}" text-anchor="end" class="mc-lbl${i === 0 ? " hl" : ""}">${T(MODS[i])}</text>`)
        + `<path class="${cls}" d="M${x0} ${cy - bh / 2} H${Math.max(x0, x1 - 4)} q4 0 4 4 V${cy + bh / 2 - 4} q0 4 -4 4 H${x0} Z"/>`
        + `<line class="mc-err" x1="${lo}" x2="${hi}" y1="${cy}" y2="${cy}"/><line class="mc-err" x1="${hi}" x2="${hi}" y1="${cy - 4}" y2="${cy + 4}"/>`
        + `<text x="${Math.max(x1, hi) + 8}" y="${cy + 4}" class="mc-val">${fmt(a)}${m.unit}${i === best ? " ★" : ""}</text></g>`;
    });
    svg.innerHTML = g;
    note.textContent = (m.better === "lower" ? T("Lower is better.") : T("Higher is better.")) + " " + T("★ marks the best modality for {m}.").replace("{m}", T(m.label));
    table.innerHTML = `<thead><tr><th>${T("Modality")}</th>${Object.values(M).map((x) => `<th>${T(x.label)}${x.better === "lower" ? " ↓" : " ↑"}</th>`).join("")}</tr></thead><tbody>`
      + MODS.map((name, i) => `<tr><th>${T(name)}</th>${Object.values(M).map((x) => `<td>${fmt(x.v[i][0])} ± ${fmt(x.v[i][1])}</td>`).join("")}</tr>`).join("") + "</tbody>";
    svg.querySelectorAll(".mc-row").forEach((row) => {
      row.addEventListener("pointerenter", () => {
        const i = +row.dataset.i, [a, s] = m.v[i];
        tip.innerHTML = `<b>${T(MODS[i])}</b><br>${T(m.label)}: ${fmt(a)}${m.unit} ± ${fmt(s)}${m.unit}`;
        const r = row.getBoundingClientRect(), b = svg.parentElement.getBoundingClientRect();
        tip.style.left = Math.max(0, Math.min(r.left - b.left + padL, b.width - 220)) + "px"; tip.style.top = r.top - b.top - 44 + "px"; tip.hidden = false;
        row.classList.add("hover");
      });
      row.addEventListener("pointerleave", () => { tip.hidden = true; row.classList.remove("hover"); });
    });
  }
  const btns = box.querySelectorAll("[data-mc]");
  btns.forEach((b) => b.addEventListener("click", () => { key = b.dataset.mc; btns.forEach((x) => x.setAttribute("aria-pressed", String(x === b))); render(); }));
  const tb = box.querySelector("#mcTable");
  tb.addEventListener("click", () => { const on = table.hidden; table.hidden = !on; tb.setAttribute("aria-pressed", String(on)); tb.textContent = on ? T("Hide table") : T("Show table"); });
  document.addEventListener("langchange", () => { tb.textContent = table.hidden ? T("Show table") : T("Hide table"); render(); });
  new ResizeObserver(render).observe(svg);
  render();
})();

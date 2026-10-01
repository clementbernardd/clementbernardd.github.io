// Interactive RNA 3D viewer: canvas renderer for C4′ backbone + bases, drag to rotate, fold/unfold animation
(function () {
  const data = window.RNA_DATA, root = document.getElementById("rna");
  if (!data || !root) return;
  const $ = (s) => root.querySelector(s), $$ = (s) => Array.from(root.querySelectorAll(s));
  const cv = $("canvas"), ctx = cv.getContext("2d"), tip = $(".rna-tip");
  const seqEl = $("#rnaSeq"), rmsdEl = $("#rnaRmsd"), pairsEl = $("#rnaPairs"), slider = $("#rnaFold"), foldBtn = $("#rnaFoldBtn");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // colours from the site tokens (refreshed when the theme changes)
  let col = {};
  const hex = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ["a", "t", "g", "c", "fg", "muted", "bg", "surface"]) col[k] = hex(cs.getPropertyValue("--" + k).trim() || "#888");
    dirty = true;
  }
  const mix = (c1, c2, f) => c1.map((v, i) => Math.round(v + (c2[i] - v) * f));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const baseCol = (b) => col[{ A: "a", U: "t", G: "g", C: "c" }[b]];
  function rainbow(f) {
    const stops = [col.a, col.g, col.c, col.t], x = f * (stops.length - 1), i = Math.min(Math.floor(x), stops.length - 2);
    return mix(stops[i], stops[i + 1], x - i);
  }

  // state
  let S, n, nat, natB, unf, unfB, pairOf, P = [], B = [], maxR = 1;
  let R = rot(-0.35, 0), zoom = 1, t = 1, spin = !reduced, mode = "nuc", hover = -1, dirty = true, visible = false, anim = null;

  function rot(ax, ay) {
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
    return mul([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]);
  }
  function mul(a, b) { return a.map((r) => [0, 1, 2].map((j) => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j])); }
  const ap = (m, p) => [m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2], m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2], m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2]];

  function load(idx) {
    S = data[idx]; n = S.seq.length; nat = S.c4; natB = S.base;
    maxR = Math.max(...nat.map((p) => Math.hypot(...p)));
    pairOf = new Array(n).fill(-1);
    S.pairs.forEach(([i, j]) => { pairOf[i] = j; pairOf[j] = i; });
    // "unfolded" state: a loose single-stranded coil, bases pointing outwards
    const turns = 3, r = maxR * 0.62, h = maxR * 1.7;
    unf = []; unfB = [];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1), a = f * turns * 2 * Math.PI;
      const p = [r * Math.cos(a), h * (f - 0.5), r * Math.sin(a)];
      unf.push(p); unfB.push([p[0] * 1.12, p[1], p[2] * 1.12]);
    }
    buildSeq(); update(); dirty = true;
  }

  const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  function update() {
    const e = ease(t);
    for (let i = 0; i < n; i++) {
      P[i] = [0, 1, 2].map((k) => unf[i][k] + (nat[i][k] - unf[i][k]) * e);
      B[i] = [0, 1, 2].map((k) => unfB[i][k] + (natB[i][k] - unfB[i][k]) * e);
    }
    P.length = B.length = n;
    let s = 0; for (let i = 0; i < n; i++) s += (P[i][0] - nat[i][0]) ** 2 + (P[i][1] - nat[i][1]) ** 2 + (P[i][2] - nat[i][2]) ** 2;
    rmsdEl.textContent = Math.sqrt(s / n).toFixed(1) + " Å";
    let formed = 0;
    S.pairs.forEach(([i, j]) => { if (dist(B[i], B[j]) < dist(natB[i], natB[j]) + 1.5) formed++; });
    pairsEl.textContent = `${formed} / ${S.pairs.length}`;
    slider.value = Math.round(t * 100);
    foldBtn.textContent = t > 0.5 ? "Unfold" : "Fold it";
    dirty = true;
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // canvas sizing
  let W = 0, H = 0, dpr = 1;
  function resize() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    dirty = true;
  }
  new ResizeObserver(resize).observe(cv);

  let proj = [], projB = [];
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!W) return;
    const fit = Math.min(W, H) * 0.44 / maxR * zoom, D = maxR * 4;
    const pr = (p) => { const q = ap(R, p), s = D / (D + q[2]); return [W / 2 + q[0] * fit * s, H / 2 - q[1] * fit * s, q[2], s]; };
    proj = P.map(pr); projB = B.map(pr);
    const depth = (z) => Math.min(Math.max((z + maxR) / (2 * maxR), 0), 1) * 0.6; // 0 front → 0.6 back
    const resCol = (i) => mode === "nuc" ? baseCol(S.seq[i]) : mode === "rainbow" ? rainbow(i / (n - 1)) : (pairOf[i] >= 0 ? col.c : col.muted);
    const items = [];
    for (let i = 0; i < n - 1; i++) items.push({ z: (proj[i][2] + proj[i + 1][2]) / 2, k: 0, i });
    for (let i = 0; i < n; i++) items.push({ z: projB[i][2], k: 1, i });
    const pairA = reduced ? 1 : Math.min(Math.max((t - 0.75) / 0.25, 0), 1);
    if (pairA > 0) S.pairs.forEach(([i, j]) => items.push({ z: (projB[i][2] + projB[j][2]) / 2 - 0.01, k: 2, i, j }));
    items.sort((a, b) => b.z - a.z);
    const hi = (i) => hover >= 0 && (i === hover || i === pairOf[hover]);
    ctx.lineCap = "round";
    for (const it of items) {
      const f = depth(it.z);
      if (it.k === 0) {
        const a = proj[it.i], b = proj[it.i + 1];
        const c = mode === "rainbow" ? rainbow(it.i / (n - 1)) : mix(col.fg, col.muted, 0.35);
        ctx.strokeStyle = rgb(mix(c, col.bg, f));
        ctx.lineWidth = Math.max(2, 5.5 * a[3] * zoom);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      } else if (it.k === 1) {
        const a = proj[it.i], b = projB[it.i], c = mix(resCol(it.i), col.bg, f);
        ctx.strokeStyle = rgb(c); ctx.lineWidth = Math.max(1.5, 3.2 * b[3] * zoom);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        const r = Math.max(2.5, (hi(it.i) ? 7.5 : 4.6) * b[3] * zoom);
        ctx.fillStyle = rgb(c);
        ctx.beginPath(); ctx.arc(b[0], b[1], r, 0, 7); ctx.fill();
        if (hi(it.i)) { ctx.strokeStyle = rgb(col.fg); ctx.lineWidth = 2; ctx.stroke(); }
      } else {
        const a = projB[it.i], b = projB[it.j];
        ctx.strokeStyle = rgb(mix(col.fg, col.bg, f), (hi(it.i) ? 0.95 : 0.45) * pairA);
        ctx.lineWidth = hi(it.i) ? 2.2 : 1.3;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // 5′ / 3′ end labels
    ctx.font = "600 11px 'JetBrains Mono', monospace"; ctx.fillStyle = rgb(col.muted);
    ctx.fillText("5′", proj[0][0] + 8, proj[0][1] - 8);
    ctx.fillText("3′", proj[n - 1][0] + 8, proj[n - 1][1] - 8);
  }

  function frame() {
    if (!visible) { loopOn = false; return; }
    if (spin && !dragging) { R = mul(rot(0, 0.0045), R); dirty = true; }
    if (anim) {
      const p = Math.min((performance.now() - anim.t0) / anim.dur, 1);
      t = anim.from + (anim.to - anim.from) * p; update();
      if (p >= 1) anim = null;
    }
    if (dirty) { draw(); dirty = false; }
    requestAnimationFrame(frame);
  }
  let loopOn = false;
  const kick = () => { if (!loopOn && visible) { loopOn = true; requestAnimationFrame(frame); } };
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }).observe(cv);

  // pointer interaction: drag rotate, pinch zoom, hover info
  const pts = new Map(); let dragging = false, last = null, start = null, pinch0 = 0, zoom0 = 1;
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    dragging = true; last = start = [e.clientX, e.clientY];
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = zoom; }
  });
  cv.addEventListener("pointermove", (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (dragging && pts.size === 1) {
      const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY];
      R = mul(rot(dy * 0.01, dx * 0.01), R); dirty = true; hideTip();
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      zoom = Math.min(Math.max(zoom0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0, 0.5), 3); dirty = true;
    } else if (e.pointerType === "mouse") pick(e);
  });
  const up = (e) => { pts.delete(e.pointerId); if (!pts.size) dragging = false; else last = [...pts.values()][0]; };
  cv.addEventListener("pointerup", (e) => { const moved = start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6; up(e); if (e.pointerType !== "mouse" && !moved) pick(e); });
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("pointerleave", () => { if (!dragging) setHover(-1); });
  cv.addEventListener("wheel", (e) => {
    if (document.activeElement !== cv) return; // only zoom once the viewer is focused, so page scroll keeps working
    e.preventDefault(); zoom = Math.min(Math.max(zoom * Math.exp(-e.deltaY * 0.0015), 0.5), 3); dirty = true;
  }, { passive: false });
  cv.addEventListener("keydown", (e) => {
    const k = e.key, step = 0.12;
    if (k === "ArrowLeft") R = mul(rot(0, -step), R); else if (k === "ArrowRight") R = mul(rot(0, step), R);
    else if (k === "ArrowUp") R = mul(rot(-step, 0), R); else if (k === "ArrowDown") R = mul(rot(step, 0), R);
    else if (k === "+" || k === "=") zoom = Math.min(zoom * 1.15, 3); else if (k === "-") zoom = Math.max(zoom / 1.15, 0.5);
    else if (k === " ") setSpin(!spin); else if (k === "f") toggleFold(); else return;
    e.preventDefault(); dirty = true;
  });

  function pick(e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = -1, bd = 16;
    projB.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = i; } });
    setHover(best, x, y);
  }
  function label(i) { return S.seq[i] + S.num[i]; }
  function setHover(i, x, y) {
    if (i === hover && i < 0) return;
    hover = i; dirty = true;
    $$("#rnaSeq .nt").forEach((el, k) => el.classList.toggle("hi", i >= 0 && (k === i || k === pairOf[i])));
    if (i < 0) return hideTip();
    const j = pairOf[i];
    tip.innerHTML = `<b>${label(i)}</b> ${j >= 0 ? `paired with <b>${label(j)}</b>` : "unpaired"}`;
    if (x == null) { const p = projB[i] || [W / 2, H / 2]; x = p[0]; y = p[1]; }
    tip.style.transform = `translate(${Math.min(x + 14, W - 170)}px, ${Math.max(y - 36, 4)}px)`;
    tip.hidden = false;
  }
  function hideTip() { tip.hidden = true; }

  // sequence + dot-bracket strip (crossing pairs get [] {} <> brackets)
  function buildSeq() {
    const db = new Array(n).fill("."), kinds = ["()", "[]", "{}", "<>"], placed = [];
    S.pairs.slice().sort((a, b) => a[0] - b[0]).forEach(([i, j]) => {
      for (let k = 0; k < kinds.length; k++) {
        if (placed.some((p) => p.k === k && (p.i < i && i < p.j && p.j < j || i < p.i && p.i < j && j < p.j))) continue;
        db[i] = kinds[k][0]; db[j] = kinds[k][1]; placed.push({ i, j, k }); break;
      }
    });
    seqEl.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.className = "nt " + S.seq[i]; s.tabIndex = -1;
      s.innerHTML = `<b>${S.seq[i]}</b><i>${db[i]}</i>`;
      s.addEventListener("mouseenter", () => setHover(i));
      s.addEventListener("mouseleave", () => setHover(-1));
      s.addEventListener("click", () => setHover(i));
      seqEl.appendChild(s);
    }
    $("#rnaName").textContent = `${S.name} · PDB ${S.id} · ${n} nt`;
    $("#rnaLink").href = `https://www.rcsb.org/structure/${S.id}`;
  }

  // controls
  function setSpin(v) { spin = v; const b = $("#rnaSpin"); b.setAttribute("aria-pressed", String(v)); b.textContent = v ? "Pause spin" : "Spin"; kick(); }
  function toggleFold() {
    const to = t > 0.5 ? 0 : 1;
    if (reduced) { t = to; update(); kick(); return; }
    anim = { from: t, to, t0: performance.now(), dur: 2400 * Math.abs(to - t) + 200 }; kick();
  }
  $$("[data-rna]").forEach((b) => b.addEventListener("click", () => {
    $$("[data-rna]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    setHover(-1); load(+b.dataset.rna); kick();
  }));
  $$("[data-color]").forEach((b) => b.addEventListener("click", () => {
    $$("[data-color]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    mode = b.dataset.color; root.dataset.mode = mode; dirty = true; kick();
  }));
  $("#rnaSpin").addEventListener("click", () => setSpin(!spin));
  $("#rnaReset").addEventListener("click", () => { R = rot(-0.35, 0); zoom = 1; dirty = true; kick(); });
  $("#rnaZoomIn").addEventListener("click", () => { zoom = Math.min(zoom * 1.2, 3); dirty = true; kick(); });
  $("#rnaZoomOut").addEventListener("click", () => { zoom = Math.max(zoom / 1.2, 0.5); dirty = true; kick(); });
  foldBtn.addEventListener("click", toggleFold);
  slider.addEventListener("input", () => { anim = null; t = slider.value / 100; update(); kick(); });

  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);
  readColors(); load(0); setSpin(spin);

  // start unfolded and fold the first time the viewer scrolls into view
  if (!reduced) {
    t = 0; update();
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io.disconnect(); setTimeout(toggleFold, 400); } }, { threshold: 0.5 });
    io.observe(cv);
  }
})();

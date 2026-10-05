// AI playground: toy self-attention visualizer (NLP) and a live tabular Q-learning agent (RL)
(function () {
  const root = document.getElementById("aiLab");
  if (!root) return;
  const $ = (s) => root.querySelector(s), $$ = (s) => Array.from(root.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const T = (s) => (window.I18N ? window.I18N.t(s) : s);

  // shared colour helpers
  let col = {};
  const hex = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (c1, c2, f) => c1.map((v, i) => Math.round(v + (c2[i] - v) * f));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ["a", "t", "g", "c", "fg", "muted", "bg", "surface", "line"]) col[k] = hex(cs.getPropertyValue("--" + k).trim() || "#888");
    rlDirty = true;
  }
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);

  // tabs
  const tabs = $$("[role=tab]");
  function showTab(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (tab.dataset.tab === "nlp") renderAttn(); else { rlResize(); rlKick(); }
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => showTab(t));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); showTab(n);
    });
  });

  /* ---------------- NLP: self-attention ---------------- */
  const input = $("#attnInput"), qCol = $("#attnQ"), kCol = $("#attnK"), svg = $("#attnSvg"), wrap = $(".attn"), matrix = $("#attnMatrix"), headInfo = $("#attnHeadInfo");
  const HEADS = [
    { name: "Local context", info: "Looks at neighbouring tokens, like an n-gram window." },
    { name: "Similar tokens", info: "Matches tokens with similar spelling (hashed character trigrams)." },
    { name: "Previous token", info: "Attends to the token just before, a classic 'induction' building block." },
    { name: "Sentence summary", info: "Dumps attention on [CLS] and punctuation, which act as attention sinks." },
    { name: "All heads (mean)", info: "Average of the four heads." },
  ];
  let tokens = [], A = [], head = 0, sel = 1;
  const MAXT = 14;

  function tokenize(text) {
    const words = text.match(/[A-Za-z0-9']+|[^\sA-Za-z0-9]/g) || [];
    const out = ["[CLS]"];
    for (const w of words) {
      if (w.length > 8) { out.push(w.slice(0, 5)); for (let i = 5; i < w.length; i += 5) out.push("##" + w.slice(i, i + 5)); }
      else out.push(w);
    }
    return out.slice(0, MAXT);
  }
  function embed(tok) {
    const v = new Float32Array(32), s = "^" + tok.replace(/^##/, "").toLowerCase() + "$";
    for (let i = 0; i < s.length - 2; i++) {
      let h = 2166136261; for (let k = 0; k < 3; k++) h = Math.imul(h ^ s.charCodeAt(i + k), 16777619);
      v[(h >>> 0) % 32] += 1;
    }
    const nrm = Math.hypot(...v) || 1; return v.map((x) => x / nrm);
  }
  const softmax = (r) => { const m = Math.max(...r), e = r.map((x) => Math.exp(x - m)), s = e.reduce((a, b) => a + b, 0); return e.map((x) => x / s); };
  const isPunct = (t) => /^[^A-Za-z0-9#\[]$/.test(t);
  function computeAttn() {
    const n = tokens.length, E = tokens.map(embed);
    const score = (h, i, j) => {
      if (h === 0) return -((i - j) ** 2) / 2;
      if (h === 1) { let d = 0; for (let k = 0; k < 32; k++) d += E[i][k] * E[j][k]; return d * 6 - (i === j ? 2 : 0); }
      if (h === 2) return j === i - 1 ? 4 : j === i ? 1 : 0;
      return j === 0 ? 3 : isPunct(tokens[j]) ? 2 : 0;
    };
    const one = (h) => Array.from({ length: n }, (_, i) => softmax(Array.from({ length: n }, (_, j) => score(h, i, j))));
    if (head < 4) A = one(head);
    else { const all = [0, 1, 2, 3].map(one); A = all[0].map((r, i) => r.map((_, j) => all.reduce((s, m) => s + m[i][j], 0) / 4)); }
  }
  function buildAttn() {
    tokens = tokenize(input.value);
    sel = Math.min(sel, tokens.length - 1);
    computeAttn();
    const mk = (parent, isQ) => {
      parent.innerHTML = "";
      tokens.forEach((t, i) => {
        const b = document.createElement(isQ ? "button" : "span");
        b.className = "tok"; b.textContent = t;
        if (isQ) {
          b.type = "button";
          b.addEventListener("mouseenter", () => select(i));
          b.addEventListener("focus", () => select(i));
          b.addEventListener("click", () => select(i));
        }
        parent.appendChild(b);
      });
    };
    mk(qCol, true); mk(kCol, false);
    matrix.style.gridTemplateColumns = `repeat(${tokens.length}, 1fr)`;
    matrix.innerHTML = "";
    tokens.forEach((_, i) => tokens.forEach((_, j) => {
      const c = document.createElement("span"); c.dataset.i = i; c.title = `${tokens[i]} → ${tokens[j]}`;
      c.addEventListener("mouseenter", () => select(i));
      matrix.appendChild(c);
    }));
    renderAttn();
  }
  function select(i) { if (sel !== i) { sel = i; renderAttn(); } }
  function renderAttn() {
    if (!tokens.length || wrap.offsetParent === null) return;
    const w = A[sel], wr = wrap.getBoundingClientRect();
    const qs = Array.from(qCol.children), ks = Array.from(kCol.children);
    qs.forEach((el, i) => el.classList.toggle("on", i === sel));
    ks.forEach((el, j) => el.style.setProperty("--w", w[j].toFixed(3)));
    svg.setAttribute("viewBox", `0 0 ${wr.width} ${wr.height}`);
    let paths = "";
    const q = qs[sel].getBoundingClientRect(), x1 = q.right - wr.left, y1 = q.top + q.height / 2 - wr.top;
    ks.forEach((el, j) => {
      const k = el.getBoundingClientRect(), x2 = k.left - wr.left, y2 = k.top + k.height / 2 - wr.top, mx = (x1 + x2) / 2;
      paths += `<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" stroke-width="${(1 + w[j] * 10).toFixed(2)}" stroke-opacity="${(0.08 + w[j] * 0.92).toFixed(3)}"/>`;
    });
    svg.innerHTML = paths;
    const cells = matrix.children, n = tokens.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const c = cells[i * n + j]; c.style.setProperty("--w", A[i][j].toFixed(3)); c.classList.toggle("row", i === sel);
    }
    const top = w.map((v, j) => [v, j]).filter(([, j]) => j !== sel).sort((a, b) => b[0] - a[0])[0];
    headInfo.innerHTML = `<b>${T(HEADS[head].name)}.</b> ${T(HEADS[head].info)} ` + T("“{a}” attends most to “{b}” ({p}%).").replace("{a}", tokens[sel]).replace("{b}", tokens[top ? top[1] : sel]).replace("{p}", Math.round((top ? top[0] : w[sel]) * 100));
  }
  $$("[data-head]").forEach((b) => b.addEventListener("click", () => {
    head = +b.dataset.head;
    $$("[data-head]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    computeAttn(); renderAttn();
  }));
  input.addEventListener("input", buildAttn);
  $$("[data-example]").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.example; sel = 1; buildAttn(); }));
  new ResizeObserver(() => renderAttn()).observe(wrap);

  /* ---------------- RL: Q-learning gridworld ---------------- */
  const cv = $("#rlCanvas"), ctx = cv.getContext("2d"), spark = $("#rlSpark"), sctx = spark.getContext("2d");
  const COLS = 12, ROWS = 7, ACT = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const ALPHA = 0.5, GAMMA = 0.95, STEP_R = -0.04;
  let grid, start, goal, Q, agent, ep, eps, epSteps, epReturn, history, successes, greedy, running = false, speed = 1, tool = "wall", trail = [];
  let rlDirty = true, rlVisible = false, frameN = 0;

  function defaultMap() {
    grid = new Uint8Array(COLS * ROWS);
    for (let y = 0; y <= 4; y++) grid[y * COLS + 3] = 1;
    for (let y = 2; y < ROWS; y++) grid[y * COLS + 7] = 2;
    grid[0 * COLS + 7] = 1;
    start = [0, 6]; goal = [11, 6];
  }
  function resetAgent() {
    Q = new Float32Array(COLS * ROWS * 4);
    ep = 0; eps = 1; history = []; successes = [];
    newEpisode(); rlDirty = true; stats();
  }
  function newEpisode() { agent = start.slice(); epSteps = 0; epReturn = 0; trail = []; }
  const idx = (x, y) => y * COLS + x;
  const maxQ = (s) => Math.max(Q[s * 4], Q[s * 4 + 1], Q[s * 4 + 2], Q[s * 4 + 3]);
  function argmax(s) {
    let b = 0, bv = -Infinity;
    for (let a = 0; a < 4; a++) { const v = Q[s * 4 + a] + Math.random() * 1e-6; if (v > bv) { bv = v; b = a; } }
    return b;
  }
  function step() {
    const s = idx(...agent);
    const a = !greedy && Math.random() < eps ? Math.floor(Math.random() * 4) : argmax(s);
    let nx = agent[0] + ACT[a][0], ny = agent[1] + ACT[a][1];
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || grid[idx(nx, ny)] === 1) { nx = agent[0]; ny = agent[1]; }
    const s2 = idx(nx, ny), atGoal = nx === goal[0] && ny === goal[1], lava = grid[s2] === 2;
    const r = atGoal ? 1 : lava ? -1 : STEP_R, done = atGoal || lava || epSteps >= 250;
    if (!greedy) Q[s * 4 + a] += ALPHA * (r + (atGoal || lava ? 0 : GAMMA * maxQ(s2)) - Q[s * 4 + a]);
    agent = [nx, ny]; epSteps++; epReturn += r;
    trail.push(agent.slice()); if (trail.length > 40) trail.shift();
    if (done) {
      ep++; history.push(epSteps); if (history.length > 120) history.shift();
      successes.push(atGoal ? 1 : 0); if (successes.length > 20) successes.shift();
      if (greedy) { greedy = false; setRunning(false); $("#rlMsg").textContent = atGoal ? T("Greedy run reached the goal in {n} steps.").replace("{n}", epSteps) : lava ? T("Greedy run fell in the lava. Train a bit more.") : T("Greedy run got lost. Train a bit more."); }
      eps = Math.max(0.05, eps * 0.97);
      newEpisode();
    }
  }
  function stats() {
    $("#rlEp").textContent = ep;
    $("#rlEps").textContent = eps.toFixed(2);
    $("#rlLast").textContent = history.length ? history[history.length - 1] : "–";
    $("#rlRate").textContent = successes.length ? Math.round(successes.reduce((a, b) => a + b, 0) / successes.length * 100) + "%" : "–";
  }

  let W = 0, cell = 0, dpr = 1;
  function rlResize() {
    const w = cv.parentElement.clientWidth; if (!w) return;
    dpr = Math.min(devicePixelRatio || 1, 2); W = w; cell = W / COLS;
    cv.style.height = cell * ROWS + "px";
    cv.width = Math.round(W * dpr); cv.height = Math.round(cell * ROWS * dpr);
    const sw = spark.clientWidth; spark.width = Math.round(sw * dpr); spark.height = Math.round(44 * dpr);
    rlDirty = true;
  }
  function drawRL() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, cell * ROWS);
    const gap = 2;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const s = idx(x, y), t = grid[s], px = x * cell, py = y * cell;
      let c;
      if (t === 1) c = col.fg;
      else if (t === 2) c = col.a;
      else { const v = maxQ(s); c = v >= 0 ? mix(col.surface, col.c, Math.min(v, 1) * 0.85) : mix(col.surface, col.a, Math.min(-v, 1) * 0.3); }
      ctx.fillStyle = rgb(c);
      roundRect(px + gap / 2, py + gap / 2, cell - gap, cell - gap, Math.min(8, cell * 0.18)); ctx.fill();
      if (t === 2) { ctx.fillStyle = rgb(col.bg, 0.25); ctx.font = `${cell * 0.38}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("≈", px + cell / 2, py + cell / 2); }
      if (t === 0 && (Q[s * 4] || Q[s * 4 + 1] || Q[s * 4 + 2] || Q[s * 4 + 3]) && !(x === goal[0] && y === goal[1])) arrow(px + cell / 2, py + cell / 2, argmax(s), cell * 0.17);
    }
    label(goal, T("GOAL"), col.g); label(start, T("START"), null);
    trail.forEach((p, i) => { ctx.fillStyle = rgb(col.t, (i / trail.length) * 0.35); ctx.beginPath(); ctx.arc((p[0] + 0.5) * cell, (p[1] + 0.5) * cell, cell * 0.12, 0, 7); ctx.fill(); });
    ctx.fillStyle = rgb(col.t); ctx.strokeStyle = rgb(col.bg); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc((agent[0] + 0.5) * cell, (agent[1] + 0.5) * cell, cell * 0.28, 0, 7); ctx.fill(); ctx.stroke();
    // sparkline: steps per episode
    const sw = spark.width / dpr, sh = 44;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0); sctx.clearRect(0, 0, sw, sh);
    if (history.length > 1) {
      const mx = Math.max(...history);
      sctx.strokeStyle = rgb(col.t); sctx.lineWidth = 1.6; sctx.beginPath();
      history.forEach((v, i) => { const x = i / (history.length - 1) * (sw - 4) + 2, y = sh - 3 - v / mx * (sh - 8); i ? sctx.lineTo(x, y) : sctx.moveTo(x, y); });
      sctx.stroke();
    }
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function arrow(cx, cy, a, s) {
    const [dx, dy] = ACT[a];
    ctx.fillStyle = rgb(col.fg, 0.45); ctx.beginPath();
    ctx.moveTo(cx + dx * s, cy + dy * s);
    ctx.lineTo(cx - dx * s * 0.6 - dy * s * 0.7, cy - dy * s * 0.6 + dx * s * 0.7);
    ctx.lineTo(cx - dx * s * 0.6 + dy * s * 0.7, cy - dy * s * 0.6 - dx * s * 0.7);
    ctx.closePath(); ctx.fill();
  }
  function label(p, txt, c) {
    const px = p[0] * cell, py = p[1] * cell;
    if (c) { ctx.fillStyle = rgb(c); roundRect(px + 1, py + 1, cell - 2, cell - 2, Math.min(8, cell * 0.18)); ctx.fill(); }
    ctx.fillStyle = rgb(c ? [19, 21, 43] : col.muted); ctx.font = `600 ${Math.max(8, cell * 0.2)}px 'JetBrains Mono', monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, px + cell / 2, py + cell / 2);
  }

  const SPEEDS = { 1: [1, 6], 2: [8, 1], 3: [300, 1] }; // [steps, every n frames]
  let rlLoop = false;
  function rlFrame() {
    if (!rlVisible) { rlLoop = false; return; }
    frameN++;
    if (running) {
      const [k, every] = SPEEDS[greedy ? 1 : speed];
      if (frameN % every === 0) { for (let i = 0; i < k && running; i++) step(); stats(); rlDirty = true; }
    }
    if (rlDirty) { drawRL(); rlDirty = false; }
    requestAnimationFrame(rlFrame);
  }
  function rlKick() { if (!rlLoop && rlVisible) { rlLoop = true; requestAnimationFrame(rlFrame); } }
  new IntersectionObserver(([en]) => { rlVisible = en.isIntersecting; rlKick(); }).observe(cv);

  function setRunning(v) { running = v; const b = $("#rlRun"); b.textContent = v ? T("Pause") : T("Train"); b.setAttribute("aria-pressed", String(v)); rlKick(); }
  $("#rlRun").addEventListener("click", () => { greedy = false; $("#rlMsg").textContent = ""; setRunning(!running); });
  $("#rlGreedy").addEventListener("click", () => { newEpisode(); greedy = true; $("#rlMsg").textContent = T("Following the learned policy, no exploration…"); setRunning(true); });
  $("#rlReset").addEventListener("click", () => { setRunning(false); resetAgent(); $("#rlMsg").textContent = T("Agent memory wiped. It knows nothing again."); });
  $("#rlMap").addEventListener("click", () => { setRunning(false); defaultMap(); resetAgent(); $("#rlMsg").textContent = ""; });
  $$("[data-speed]").forEach((b) => b.addEventListener("click", () => { speed = +b.dataset.speed; $$("[data-speed]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
  $$("[data-tool]").forEach((b) => b.addEventListener("click", () => { tool = b.dataset.tool; $$("[data-tool]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));

  // paint on the grid
  let painting = false, paintVal = null;
  function cellAt(e) { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / cell), Math.floor((e.clientY - r.top) / cell)]; }
  function paint(e) {
    const [x, y] = cellAt(e); if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const s = idx(x, y), isStart = x === start[0] && y === start[1], isGoal = x === goal[0] && y === goal[1];
    if (tool === "goal" || tool === "start") {
      if (isStart || isGoal) return;
      grid[s] = 0; if (tool === "goal") goal = [x, y]; else { start = [x, y]; newEpisode(); }
    } else {
      if (isStart || isGoal) return;
      const v = tool === "wall" ? 1 : 2;
      if (paintVal === null) paintVal = grid[s] === v ? 0 : v; // first cell decides paint vs erase
      grid[s] = paintVal;
      if (agent[0] === x && agent[1] === y && paintVal) newEpisode();
    }
    rlDirty = true; rlKick();
  }
  cv.addEventListener("pointerdown", (e) => { painting = true; paintVal = null; cv.setPointerCapture(e.pointerId); paint(e); });
  cv.addEventListener("pointermove", (e) => { if (painting && (tool === "wall" || tool === "lava")) paint(e); });
  cv.addEventListener("pointerup", () => { painting = false; });

  new ResizeObserver(rlResize).observe(cv.parentElement);

  readColors();
  defaultMap(); resetAgent();
  document.addEventListener("langchange", () => { renderAttn(); setRunning(running); $("#rlMsg").textContent = ""; rlDirty = true; rlKick(); });
  buildAttn();
})();

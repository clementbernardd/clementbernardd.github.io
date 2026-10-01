// Projects, tutorials and research extras: video previews, filters, RL env switcher,
// network-friendly recommendation animation, 2D superposition demo, publication sorting
(function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = matchMedia("(hover: hover)").matches;
  const press = (group, btn) => group.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  const hex = (h) => { h = h.trim().replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const cssVar = (k) => hex(getComputedStyle(document.documentElement).getPropertyValue("--" + k) || "#888");
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  /* ---------- video previews: hover to play (touch: play while visible) ---------- */
  const vids = $$(".autovid");
  const play = (v) => { const p = v.play(); if (p) p.catch(() => {}); };
  if (!reduced) {
    if (canHover) {
      vids.forEach((v) => {
        const host = v.closest(".proj, .serie") || v;
        host.addEventListener("pointerenter", () => play(v));
        host.addEventListener("pointerleave", () => { if (!(host.classList.contains("serie") && host.getAttribute("aria-pressed") === "true")) v.pause(); });
      });
    }
    const io = new IntersectionObserver((ens) => ens.forEach((en) => {
      const v = en.target, serie = v.closest(".serie");
      const auto = !canHover || (serie && serie.getAttribute("aria-pressed") === "true");
      if (en.isIntersecting && auto) play(v); else if (!en.isIntersecting) v.pause();
    }), { threshold: 0.4 });
    vids.forEach((v) => io.observe(v));
  }

  /* ---------- tutorials: series picker ---------- */
  const series = $$(".serie"), posts = $$("#posts li"), allBtn = $("#postsAll"), label = $("#postsLabel");
  posts.forEach((li, i) => (li.querySelector("a").dataset.n = String(i + 1).padStart(2, "0")));
  let cur = "basics", showAll = false;
  function renderPosts() {
    posts.forEach((li) => (li.hidden = !showAll && li.dataset.series !== cur));
    const b = series.find((x) => x.dataset.series === cur);
    label.textContent = showAll ? "All 11 articles" : b.querySelector("b").textContent;
    allBtn.setAttribute("aria-pressed", String(showAll));
    allBtn.textContent = showAll ? "Show one series" : "Show all 11";
  }
  series.forEach((b) => b.addEventListener("click", () => {
    cur = b.dataset.series; showAll = false; press(series, b);
    series.forEach((x) => { const v = $("video", x); if (!reduced) (x === b ? play(v) : canHover || v.pause()); });
    renderPosts();
  }));
  if (allBtn) { allBtn.addEventListener("click", () => { showAll = !showAll; renderPosts(); }); renderPosts(); }

  /* ---------- projects filter ---------- */
  const pfb = $$("[data-pf]"), cards = $$("#projGrid .proj");
  pfb.forEach((b) => b.addEventListener("click", () => {
    press(pfb, b);
    cards.forEach((c) => (c.hidden = b.dataset.pf !== "all" && !c.dataset.tags.split(" ").includes(b.dataset.pf)));
  }));

  /* ---------- RL environments ---------- */
  const ENV = {
    acrobot: "Dueling DQN · count-based exploration",
    cartpole: "DDQN · ε-greedy exploration",
    mountain: "DDQN · count-based exploration",
  };
  const rlVid = $("#rlVid"), envB = $$("[data-env]");
  envB.forEach((b) => b.addEventListener("click", () => {
    press(envB, b);
    const e = b.dataset.env;
    rlVid.poster = `assets/media/rl_${e}.jpg`;
    rlVid.src = `assets/media/rl_${e}.mp4`;
    $("#rlCap").textContent = ENV[e];
    if (!reduced) play(rlVid);
  }));

  /* ---------- network-friendly recommendation animation ---------- */
  const nf = $("#nfCanvas");
  if (nf) {
    const ctx = nf.getContext("2d"), card = nf.closest(".proj");
    let W = 0, H = 0, dpr = 1, policy = "rl", visible = false;
    let s = 42; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const N = 13, nodes = [], cached = new Set([1, 4, 8, 11]);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + rnd() * 0.3, r = 0.32 + rnd() * 0.1;
      nodes.push([0.5 + Math.cos(a) * r * 1.25, 0.5 + Math.sin(a) * r]);
    }
    nodes.push([0.5, 0.5]);
    const nb = nodes.map((p, i) => nodes.map((q, j) => [Math.hypot((p[0] - q[0]) * 1.4, p[1] - q[1]), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, 3).map(([, j]) => j));
    let user = 0, from = 0, t0 = 0, recs = [], hist = [];
    function step() {
      // recommend 2 items: cache-aware policy prefers related items that are cached; random ignores both
      const rel = nb[user];
      recs = policy === "rl"
        ? rel.slice().sort((a, b) => cached.has(b) - cached.has(a)).slice(0, 2)
        : [Math.floor(rnd() * nodes.length), Math.floor(rnd() * nodes.length)];
      const relevant = recs.filter((r) => rel.includes(r) && r !== user);
      const next = relevant.length && rnd() < 0.85 ? relevant[Math.floor(rnd() * relevant.length)] : rel[Math.floor(rnd() * rel.length)];
      from = user; user = next; t0 = performance.now();
      hist.push(cached.has(next) ? 1 : 0); if (hist.length > 40) hist.shift();
      $("#nfRate").textContent = Math.round(hist.reduce((a, b) => a + b, 0) / hist.length * 100) + "%";
    }
    function size() { const r = nf.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; nf.width = W * dpr; nf.height = H * dpr; }
    new ResizeObserver(size).observe(nf);
    function draw(now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const ink = hex(rgbToHex(getComputedStyle(card).color)), c = cssVar("c"), g = cssVar("g"), a = cssVar("a");
      const P = (i) => [nodes[i][0] * W, nodes[i][1] * H];
      ctx.lineWidth = 1;
      nb.forEach((list, i) => list.forEach((j) => { if (j < i) return; const [x1, y1] = P(i), [x2, y2] = P(j); ctx.strokeStyle = rgb(ink, 0.18); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }));
      recs.forEach((r) => { const [x1, y1] = P(from), [x2, y2] = P(r); ctx.strokeStyle = rgb(g, 0.8); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]); });
      nodes.forEach((_, i) => {
        const [x, y] = P(i);
        ctx.beginPath(); ctx.arc(x, y, 9, 0, 7);
        if (cached.has(i)) { ctx.fillStyle = rgb(c); ctx.fill(); } else { ctx.strokeStyle = rgb(ink, 0.55); ctx.lineWidth = 1.5; ctx.stroke(); }
        if (recs.includes(i)) { ctx.strokeStyle = rgb(g); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.stroke(); }
      });
      const k = Math.min((now - t0) / 450, 1), e = 1 - Math.pow(1 - k, 3), [xa, ya] = P(from), [xb, yb] = P(user);
      ctx.fillStyle = rgb(a); ctx.beginPath(); ctx.arc(xa + (xb - xa) * e, ya + (yb - ya) * e, 6, 0, 7); ctx.fill();
      ctx.font = "600 10px 'JetBrains Mono', monospace"; ctx.fillStyle = rgb(ink, 0.7);
      ctx.textAlign = "right"; ctx.fillText("● cached content", W - 10, H - 12); ctx.textAlign = "left";
    }
    function rgbToHex(str) { const m = str.match(/\d+/g) || [255, 255, 255]; return "#" + m.slice(0, 3).map((v) => (+v).toString(16).padStart(2, "0")).join(""); }
    let last = 0;
    function loop(now) {
      if (!visible) return;
      if (!reduced && now - last > 1100) { last = now; step(); }
      draw(now); requestAnimationFrame(loop);
    }
    new IntersectionObserver(([en]) => { const was = visible; visible = en.isIntersecting; if (visible && !was) { if (!hist.length) for (let i = 0; i < 20; i++) step(); requestAnimationFrame(loop); } }).observe(nf);
    const nfb = $$("[data-nf]");
    nfb.forEach((b) => b.addEventListener("click", () => { press(nfb, b); policy = b.dataset.nf; hist = []; for (let i = 0; i < 20; i++) step(); if (reduced) draw(performance.now()); }));
  }

  /* ---------- superposition 101 (2D Kabsch) ---------- */
  const sc = $("#supCanvas");
  if (sc) {
    const ctx = sc.getContext("2d"), VW = 400, VH = 240, SCALE = 10; // 10 units = 1 Å
    // a hairpin-like trace as the native structure
    const native = [[90, 190], [100, 160], [112, 130], [126, 102], [146, 80], [172, 70], [198, 78], [214, 100], [224, 128], [232, 158], [240, 188], [268, 200], [300, 190]];
    let pred = [], anim = null, drag = -1, W = 0, H = 0, dpr = 1, k = 1, ox = 0, oy = 0;
    function newPred() {
      const th = (Math.random() * 0.8 + 0.5) * (Math.random() < 0.5 ? -1 : 1), cx = 195, cy = 135, dx = (Math.random() - 0.5) * 120, dy = (Math.random() - 0.5) * 60;
      pred = native.map(([x, y]) => {
        const u = x - cx, v = y - cy, nx = (Math.random() - 0.5) * 22, ny = (Math.random() - 0.5) * 22;
        return [cx + u * Math.cos(th) - v * Math.sin(th) + dx + nx, cy + u * Math.sin(th) + v * Math.cos(th) + dy + ny];
      });
      anim = null; update();
    }
    const rmsd = (A) => Math.sqrt(A.reduce((s, p, i) => s + (p[0] - native[i][0]) ** 2 + (p[1] - native[i][1]) ** 2, 0) / A.length) / SCALE;
    function kabsch(A) {
      const n = A.length, ca = [0, 0], cb = [0, 0];
      A.forEach((p, i) => { ca[0] += p[0] / n; ca[1] += p[1] / n; cb[0] += native[i][0] / n; cb[1] += native[i][1] / n; });
      let sxy = 0, sdot = 0;
      A.forEach((p, i) => { const ax = p[0] - ca[0], ay = p[1] - ca[1], bx = native[i][0] - cb[0], by = native[i][1] - cb[1]; sxy += ax * by - ay * bx; sdot += ax * bx + ay * by; });
      return { th: Math.atan2(sxy, sdot), ca, cb };
    }
    function transformed(A, th, ca, cb, f) {
      const a = th * f, c = Math.cos(a), s = Math.sin(a), tx = (cb[0] - ca[0]) * f, ty = (cb[1] - ca[1]) * f;
      return A.map(([x, y]) => { const u = x - ca[0], v = y - ca[1]; return [ca[0] + u * c - v * s + tx, ca[1] + u * s + v * c + ty]; });
    }
    function size() {
      const r = sc.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height;
      sc.width = W * dpr; sc.height = H * dpr; k = Math.min(W / VW, H / VH); ox = (W - VW * k) / 2; oy = (H - VH * k) / 2; update();
    }
    function cur() { if (!anim) return pred; const f = Math.min((performance.now() - anim.t0) / 900, 1), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; return transformed(pred, anim.th, anim.ca, anim.cb, e); }
    function update() {
      const P = cur();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const tx = (p) => [ox + p[0] * k, oy + p[1] * k], A = cssVar("a"), T = cssVar("t"), M = cssVar("muted");
      ctx.setLineDash([3, 4]); ctx.strokeStyle = rgb(M, 0.6); ctx.lineWidth = 1;
      P.forEach((p, i) => { const [x1, y1] = tx(p), [x2, y2] = tx(native[i]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); });
      ctx.setLineDash([]);
      [[native, A], [P, T]].forEach(([S, c]) => {
        ctx.strokeStyle = rgb(c); ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.beginPath();
        S.forEach((p, i) => { const [x, y] = tx(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
        S.forEach((p, i) => { const [x, y] = tx(p); ctx.fillStyle = rgb(c); ctx.beginPath(); ctx.arc(x, y, i === drag && S === P ? 8 : 5.5, 0, 7); ctx.fill(); });
      });
      ctx.font = "600 11px 'JetBrains Mono', monospace";
      ctx.fillStyle = rgb(A); ctx.fillText("native", 10, 18); ctx.fillStyle = rgb(T); ctx.fillText("prediction", 70, 18);
      $("#supRmsd").textContent = rmsd(P).toFixed(1) + " Å";
      if (anim) { if (performance.now() - anim.t0 >= 900) { pred = transformed(pred, anim.th, anim.ca, anim.cb, 1); anim = null; update(); } else requestAnimationFrame(update); }
    }
    function toView(e) { const r = sc.getBoundingClientRect(); return [(e.clientX - r.left - ox) / k, (e.clientY - r.top - oy) / k]; }
    sc.addEventListener("pointerdown", (e) => {
      if (anim) return;
      const [x, y] = toView(e); let best = -1, bd = 18 / k;
      pred.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) { drag = best; sc.setPointerCapture(e.pointerId); update(); }
    });
    sc.addEventListener("pointermove", (e) => {
      if (drag < 0) { const [x, y] = toView(e); sc.style.cursor = pred.some((p) => Math.hypot(p[0] - x, p[1] - y) < 18 / k) ? "grab" : "default"; return; }
      const [x, y] = toView(e); pred[drag] = [Math.max(0, Math.min(VW, x)), Math.max(0, Math.min(VH, y))]; update();
    });
    sc.addEventListener("pointerup", () => { drag = -1; update(); });
    $("#supGo").addEventListener("click", () => {
      const { th, ca, cb } = kabsch(pred);
      if (reduced) { pred = transformed(pred, th, ca, cb, 1); update(); return; }
      anim = { th, ca, cb, t0: performance.now() }; update();
    });
    $("#supNew").addEventListener("click", newPred);
    new ResizeObserver(size).observe(sc);
    new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    newPred();
  }

  /* ---------- publications: sort by year or citations ---------- */
  const list = $("#pubs"), sb = $$("[data-sort]");
  sb.forEach((b) => b.addEventListener("click", () => {
    press(sb, b);
    const key = b.dataset.sort;
    $$(".pub", list).sort((x, y) => (+y.dataset[key] - +x.dataset[key]) || (+y.dataset.y - +x.dataset.y)).forEach((li) => list.appendChild(li));
  }));
})();

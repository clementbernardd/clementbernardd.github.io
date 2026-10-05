// "Has AlphaFold 3 achieved success for RNA?" explorer: AlphaFold 3 per target on five test sets,
// three views (per test set, vs. sequence length, Watson-Crick vs. non-canonical pairs), one highlighted set at a time.
(function () {
  const D = window.AF3_DATA, root = document.getElementById("af3Chart");
  if (!D || !root) return;
  const T = (s) => (window.I18N ? window.I18N.t(s) : s);
  const $ = (s) => root.querySelector(s), $$ = (s) => Array.from(root.querySelectorAll(s));
  const svg = $(".ac-plot svg"), tip = $(".ac-tip"), table = $("table"), note = $(".ac-note");

  const SETS = ["RNA-Puzzles", "CASP-RNA", "RNASolo", "RNA3DB_0 (orphans)", "RNA3DB_Long"];
  const MET = {
    rmsd: { label: "RMSD", unit: " Å", better: "lower" },
    tm: { label: "TM-score", unit: "", better: "higher", max: 1 },
    lddt: { label: "lDDT", unit: "", better: "higher", max: 1 },
    inf: { label: "INF", unit: "", better: "higher", max: 1 },
    mcq: { label: "MCQ", unit: "°", better: "lower" },
  };
  let view = "sets", metric = "tm", focus = -1;

  const median = (a) => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const fmt = (v, m) => (m === "rmsd" || m === "mcq" ? v.toFixed(1) : v.toFixed(2));
  const nice = (raw) => { const mag = Math.pow(10, Math.floor(Math.log10(raw / 4))), st = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => raw / s <= 5); return { max: Math.ceil(raw / st) * st, step: st }; };
  const jit = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return ((h >>> 0) % 1000) / 1000 - 0.5; };
  const vals = (k) => D.rows.filter((r) => r[k] != null);

  function render() {
    const w = svg.clientWidth || 700, narrow = w < 560;
    tip.hidden = true;
    let g = "", h;
    if (view === "sets") {
      const m = MET[metric], rowH = narrow ? 50 : 44, padL = narrow ? 8 : 168, padR = 70, top = 6;
      h = top + rowH * SETS.length + 26;
      const all = vals(metric).map((r) => r[metric]), sc = m.max ? { max: 1, step: 0.25 } : nice(Math.max(...all));
      const x = (v) => padL + (Math.min(v, sc.max) / sc.max) * (w - padL - padR);
      g += `<g class="ac-axis">`;
      for (let v = 0; v <= sc.max + 1e-9; v += sc.step) g += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${h - 22}"/><text x="${x(v)}" y="${h - 6}" text-anchor="middle">${+v.toFixed(2)}${v + sc.step > sc.max + 1e-9 ? m.unit : ""}</text>`;
      g += `</g>`;
      SETS.forEach((name, d) => {
        const pts = D.rows.filter((r) => r.d === d && r[metric] != null), y = top + d * rowH, cy = narrow ? y + 32 : y + rowH / 2, med = median(pts.map((p) => p[metric]));
        const cls = focus >= 0 && focus !== d ? " dim" : focus === d ? " on" : "";
        g += `<g class="ac-row${cls}" data-d="${d}"><rect class="ac-hit" x="0" y="${y}" width="${w}" height="${rowH}"/>`;
        g += narrow ? `<text class="ac-name" x="${padL}" y="${y + 14}">${T(name)} <tspan>· ${pts.length}</tspan></text>`
                    : `<text class="ac-name" x="${padL - 12}" y="${cy + 4}" text-anchor="end">${T(name)} <tspan>· ${pts.length}</tspan></text>`;
        pts.forEach((p) => { g += `<circle class="ac-dot" cx="${x(p[metric])}" cy="${cy + jit(p.n) * rowH * 0.55}" r="2.8" data-i="${D.rows.indexOf(p)}"/>`; });
        g += `<line class="ac-med" x1="${x(med)}" x2="${x(med)}" y1="${cy - rowH * 0.36}" y2="${cy + rowH * 0.36}"/>`;
        g += `<text class="ac-val" x="${w - 6}" y="${cy + 4}" text-anchor="end">${fmt(med, metric)}${m.unit}</text></g>`;
      });
      note.innerHTML = `${T("Each dot is one target; the bar is the median, written on the right.")} ${m.better === "lower" ? T("Lower is better.") : T("Higher is better.")}`;
    } else {
      const H = narrow ? 300 : 380, padL = 46, padR = 14, top = 12, padB = 40; h = H;
      const pw = w - padL - padR, ph = H - top - padB;
      let xs, ys, xLab, yLab, xT, yT, kx, ky;
      if (view === "length") {
        const m = MET[metric], all = vals(metric).map((r) => r[metric]), sc = m.max ? { max: 1, step: 0.25 } : nice(Math.max(...all));
        const lx = (L) => (Math.log10(L) - 1) / (Math.log10(4000) - 1);
        xs = (r) => padL + lx(r.L) * pw;
        // "better" always points up: lower-is-better metrics are drawn with 0 at the top, as in the paper
        ys = (r) => (m.better === "lower" ? top + (Math.min(r[metric], sc.max) / sc.max) * ph : top + (1 - Math.min(r[metric], sc.max) / sc.max) * ph);
        xT = [10, 30, 100, 300, 1000, 3000].map((L) => [padL + lx(L) * pw, L]);
        yT = []; for (let v = 0; v <= sc.max + 1e-9; v += sc.step) yT.push([m.better === "lower" ? top + (v / sc.max) * ph : top + (1 - v / sc.max) * ph, +v.toFixed(2)]);
        xLab = T("Sequence length (nt, log scale)"); yLab = `${m.label}${m.unit ? " (" + m.unit.trim() + ")" : ""} · ${T("better ↑")}`; kx = "L"; ky = metric;
        note.innerHTML = T("Each dot is one target. Long RNAs (RNA3DB_Long) keep a good global fold (TM-score), while short orphan RNAs (RNA3DB_0) vary the most.");
      } else {
        xs = (r) => padL + r.wc * pw; ys = (r) => top + (1 - r.nwc) * ph;
        xT = [0, 0.25, 0.5, 0.75, 1].map((v) => [padL + v * pw, v]); yT = [0, 0.25, 0.5, 0.75, 1].map((v) => [top + (1 - v) * ph, v]);
        xLab = T("INF-WC (Watson-Crick pairs recovered)"); yLab = T("INF-nWC (non-canonical pairs)"); kx = "wc"; ky = "nwc";
        note.innerHTML = T("Each dot is one target, larger for longer RNAs. Canonical Watson-Crick pairs are mostly recovered (right), non-canonical ones much less (many at 0).");
      }
      g += `<g class="ac-axis">`;
      xT.forEach(([px, v]) => (g += `<line x1="${px}" x2="${px}" y1="${top}" y2="${top + ph}"/><text x="${px}" y="${top + ph + 15}" text-anchor="middle">${v}</text>`));
      yT.forEach(([py, v]) => (g += `<line x1="${padL}" x2="${padL + pw}" y1="${py}" y2="${py}"/><text x="${padL - 6}" y="${py + 3}" text-anchor="end">${v}</text>`));
      g += `<text class="ac-lab" x="${padL + pw / 2}" y="${H - 6}" text-anchor="middle">${xLab}</text>`;
      g += `<text class="ac-lab" transform="translate(12 ${top + ph / 2}) rotate(-90)" text-anchor="middle">${yLab}</text></g>`;
      const pts = D.rows.map((r, i) => [r, i]).filter(([r]) => r[kx] != null && r[ky] != null);
      // background sets first, highlighted set on top
      pts.sort((a, b) => (focus < 0 ? 0 : (a[0].d === focus) - (b[0].d === focus)));
      pts.forEach(([r, i]) => {
        const on = focus < 0 || r.d === focus, rad = view === "pairs" ? 2.2 + Math.log10(r.L) * 1.1 : 3.2;
        g += `<circle class="ac-pt${on ? " on" : ""}" cx="${xs(r)}" cy="${ys(r)}" r="${rad}" data-i="${i}"/>`;
      });
    }
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("height", h);
    svg.innerHTML = g;
    renderTable();
  }

  function renderTable() {
    const keys = Object.keys(MET);
    table.innerHTML = `<thead><tr><th>${T("Test set")}</th><th>${T("Targets")}</th><th>${T("Median length")}</th>${keys.map((k) => `<th>${MET[k].label}${MET[k].better === "lower" ? " ↓" : " ↑"}</th>`).join("")}</tr></thead><tbody>`
      + SETS.map((name, d) => { const rs = D.rows.filter((r) => r.d === d); return `<tr><th>${T(name)}</th><td>${rs.length}</td><td>${median(rs.map((r) => r.L))} nt</td>${keys.map((k) => { const v = rs.filter((r) => r[k] != null).map((r) => r[k]); return `<td>${v.length ? fmt(median(v), k) : "–"}</td>`; }).join("")}</tr>`; }).join("") + "</tbody>";
    const cap = $(".ac-tcap"); if (cap) cap.textContent = T("Medians per test set.");
  }

  // tooltips (event delegation, so re-renders keep working)
  svg.addEventListener("pointermove", (e) => {
    const el = e.target.closest("[data-i]");
    if (!el) { tip.hidden = true; return; }
    const r = D.rows[+el.dataset.i], b = svg.parentElement.getBoundingClientRect();
    const line = view === "pairs" ? `INF-WC ${r.wc.toFixed(2)} · INF-nWC ${r.nwc.toFixed(2)}` : `${MET[metric].label}: ${fmt(r[metric], metric)}${MET[metric].unit}`;
    tip.innerHTML = `<b>${r.n}</b> · ${T(SETS[r.d])}<br>${line}<br><span>${r.L} nt</span>`; tip.hidden = false;
    tip.style.left = Math.max(0, Math.min(e.clientX - b.left - tip.offsetWidth / 2, b.width - tip.offsetWidth)) + "px";
    tip.style.top = e.clientY - b.top - tip.offsetHeight - 12 + "px";
  });
  svg.addEventListener("pointerleave", () => (tip.hidden = true));

  // controls
  const press = (group, b) => group.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  const vB = $$("[data-aview]"), mB = $$("[data-amet]"), fB = $$("[data-aset]");
  vB.forEach((b) => b.addEventListener("click", () => { view = b.dataset.aview; press(vB, b); $(".ac-mets").hidden = view === "pairs"; render(); }));
  mB.forEach((b) => b.addEventListener("click", () => { metric = b.dataset.amet; press(mB, b); render(); }));
  fB.forEach((b) => b.addEventListener("click", () => { focus = +b.dataset.aset; press(fB, b); render(); }));
  const tb = $("#acTable");
  tb.addEventListener("click", () => { const on = table.hidden; table.hidden = !on; tb.setAttribute("aria-pressed", String(on)); tb.textContent = on ? T("Hide table") : T("Show table"); });
  document.addEventListener("langchange", () => { tb.textContent = table.hidden ? T("Show table") : T("Hide table"); render(); });
  new ResizeObserver(() => render()).observe(svg);
  render();
})();

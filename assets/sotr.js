// State-of-the-RNArt explorer: methods ranked per metric and test set, one faint dot per target,
// a family-shaped marker at the mean, and an overall normalised score (as in the paper's polar plot).
(function () {
  const D = window.SOTR_DATA, root = document.getElementById("sotrChart");
  if (!D || !root) return;
  const $ = (s) => root.querySelector(s), $$ = (s) => Array.from(root.querySelectorAll(s));
  const T = (s) => (window.I18N ? window.I18N.t(s) : s);
  const svg = $(".sc-plot svg"), tip = $(".sc-tip"), table = $("table"), note = $(".sc-note");

  const DS = { RNA_PUZZLES: "RNA-Puzzles", CASP_RNA: "CASP-RNA", RNASOLO: "RNASolo" };
  const MET = {
    overall: { label: "Overall", unit: "", better: "higher", desc: "Mean of the eight metrics, each min-max normalised across methods (1 = best on every metric)." },
    rmsd: { label: "RMSD", unit: " Å", better: "lower", desc: "Root-mean-square deviation after superposition." },
    tm: { label: "TM-score", unit: "", better: "higher", desc: "Global fold similarity, 0 to 1." },
    lddt: { label: "lDDT", unit: "", better: "higher", desc: "Local distance difference test, superposition-free." },
    inf: { label: "INF", unit: "", better: "higher", desc: "Interaction network fidelity: base pairs and stacking." },
    gdt: { label: "GDT-TS", unit: "", better: "higher", desc: "Fraction of residues under 1, 2, 4 and 8 Å." },
    ermsd: { label: "εRMSD", unit: "", better: "lower", desc: "RNA-specific deviation in base-base geometry." },
    mcq: { label: "MCQ", unit: "°", better: "lower", desc: "Mean of circular quantities: torsion-angle deviation." },
    cad: { label: "CAD", unit: "", better: "higher", desc: "Contact area difference score." },
  };
  const FAM = { dl: "Deep learning", tb: "Template-based", ai: "Ab initio" };
  const METRICS = Object.keys(MET).filter((k) => k !== "overall");
  let ds = "RNA_PUZZLES", metric = "overall", focus = null;

  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const fmt = (v, m) => (m === "rmsd" || m === "mcq" ? v.toFixed(1) : v.toFixed(2));

  function rows() {
    const d = D.datasets[ds], total = d.rnas.length;
    const per = Object.entries(d.scores).map(([name, byRna]) => {
      const vals = {};
      METRICS.forEach((m) => { vals[m] = Object.entries(byRna).filter(([, v]) => v[m] != null).map(([rna, v]) => ({ rna, v: v[m] })); });
      const means = {}; METRICS.forEach((m) => (means[m] = vals[m].length ? mean(vals[m].map((x) => x.v)) : null));
      return { name, fam: D.methods[name], vals, means, n: Object.keys(byRna).length, total };
    });
    // overall: min-max normalise each metric's means across methods, flip "lower is better", average
    METRICS.forEach((m) => {
      const xs = per.map((r) => r.means[m]).filter((x) => x != null), lo = Math.min(...xs), hi = Math.max(...xs);
      per.forEach((r) => { if (r.means[m] == null) return; let z = hi > lo ? (r.means[m] - lo) / (hi - lo) : 1; if (MET[m].better === "lower") z = 1 - z; (r.norm ||= {})[m] = z; });
    });
    per.forEach((r) => { const z = Object.values(r.norm || {}); r.means.overall = z.length ? mean(z) : null; });
    const sign = MET[metric].better === "lower" ? 1 : -1;
    return per.filter((r) => r.means[metric] != null).sort((a, b) => sign * (a.means[metric] - b.means[metric]));
  }

  function shape(fam, x, y, r) {
    if (fam === "tb") return `<rect x="${x - r * 0.88}" y="${y - r * 0.88}" width="${r * 1.76}" height="${r * 1.76}" rx="1.5"/>`;
    if (fam === "ai") return `<path d="M${x} ${y - r * 1.15} L${x + r * 1.15} ${y} L${x} ${y + r * 1.15} L${x - r * 1.15} ${y} Z"/>`;
    return `<circle cx="${x}" cy="${y}" r="${r}"/>`;
  }

  // stable pseudo-random vertical jitter per target name
  const jit = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return ((h >>> 0) % 1000) / 1000 - 0.5; };

  let lastOrder = {};
  function render() {
    const R = rows(), m = MET[metric], w = svg.clientWidth || 700, narrow = w < 560;
    const rowH = narrow ? 44 : 34, padL = narrow ? 8 : 128, padR = narrow ? 64 : 84, top = 8, h = top + rowH * R.length + 28;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("height", h);
    let xmax;
    if (metric === "overall") xmax = 1;
    else {
      const all = R.flatMap((r) => r.vals[metric].map((x) => x.v)), raw = Math.max(...all);
      if (["tm", "lddt", "inf", "gdt", "cad"].includes(metric)) xmax = 1;
      else { const mag = Math.pow(10, Math.floor(Math.log10(raw / 4))), st = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => raw / s <= 5); xmax = Math.ceil(raw / st) * st; }
    }
    const x = (v) => padL + (Math.min(v, xmax) / xmax) * (w - padL - padR);
    const ticks = []; { const st = xmax <= 1 ? 0.25 : (() => { const mag = Math.pow(10, Math.floor(Math.log10(xmax / 4))); return [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => xmax / s <= 5); })(); for (let v = 0; v <= xmax + 1e-9; v += st) ticks.push(+v.toFixed(3)); }
    let g = `<g class="sc-axis">`;
    ticks.forEach((v) => { g += `<line x1="${x(v)}" x2="${x(v)}" y1="${top - 4}" y2="${h - 22}"/><text x="${x(v)}" y="${h - 6}" text-anchor="middle">${v}${v === xmax && m.unit ? m.unit : ""}</text>`; });
    g += `</g>`;
    const best = R[0] ? R[0].name : null;
    R.forEach((r, i) => {
      const y = top + i * rowH, cy = narrow ? y + 30 : y + rowH / 2, low = r.n < r.total / 2;
      const prev = lastOrder[r.name], from = prev != null ? (prev - i) * rowH : 0;
      const dim = focus && focus !== r.fam ? " dim" : "";
      g += `<g class="sc-row f-${r.fam}${dim}${low ? " low" : ""}" data-name="${r.name}" style="--from:${from}px">`;
      g += `<rect class="sc-hit" x="0" y="${y}" width="${w}" height="${rowH}"/>`;
      g += narrow ? `<text class="sc-name" x="${padL}" y="${y + 13}">${r.name}${r.name === best ? " ★" : ""}</text>`
                  : `<text class="sc-name" x="${padL - 12}" y="${cy + 4}" text-anchor="end">${r.name}${r.name === best ? " ★" : ""}</text>`;
      g += `<line class="sc-track" x1="${x(0)}" x2="${x(xmax)}" y1="${cy}" y2="${cy}"/>`;
      if (metric === "overall") {
        const x1 = x(r.means.overall), bh = 10;
        g += `<path class="sc-bar" d="M${x(0)} ${cy - bh / 2} H${Math.max(x(0), x1 - 4)} q4 0 4 4 V${cy + bh / 2 - 4} q0 4 -4 4 H${x(0)} Z"/>`;
      } else {
        r.vals[metric].forEach((p) => { g += `<circle class="sc-dot" cx="${x(p.v)}" cy="${cy + jit(p.rna) * (rowH * 0.5)}" r="3" data-rna="${p.rna}" data-v="${p.v}"/>`; });
      }
      g += `<g class="sc-mean">${shape(r.fam, x(r.means[metric]), cy, 5.5)}</g>`;
      g += `<text class="sc-val" x="${w - 6}" y="${cy + 4}" text-anchor="end">${fmt(r.means[metric], metric)}${m.unit}</text>`;
      g += `</g>`;
    });
    svg.innerHTML = g;
    lastOrder = {}; R.forEach((r, i) => (lastOrder[r.name] = i));
    requestAnimationFrame(() => requestAnimationFrame(() => svg.querySelectorAll(".sc-row").forEach((el) => el.classList.add("settle")))); // two frames so rows animate from their old rank
    note.innerHTML = `<b>${T(m.label)}</b>: ${T(m.desc)} ${m.better === "lower" ? T("Lower is better.") : T("Higher is better.")} ` + T("★ best on {d}.").replace("{d}", DS[ds]) + (metric !== "overall" ? " " + T("Each faint dot is one target; the marker is the mean.") : "");
    renderTable(R);
    bind(R);
  }

  function renderTable(R) {
    const cols = ["overall", ...METRICS];
    table.innerHTML = `<thead><tr><th>${T("Method")}</th><th>${T("Family")}</th><th>${T("Targets")}</th>${cols.map((c) => `<th>${T(MET[c].label)}${MET[c].better === "lower" ? " ↓" : " ↑"}</th>`).join("")}</tr></thead><tbody>`
      + R.map((r) => `<tr><th>${r.name}</th><td>${T(FAM[r.fam])}</td><td>${r.n} / ${r.total}</td>${cols.map((c) => `<td>${r.means[c] == null ? "–" : fmt(r.means[c], c)}</td>`).join("")}</tr>`).join("") + "</tbody>";
  }

  function showTip(html, ev) {
    const b = svg.parentElement.getBoundingClientRect();
    tip.innerHTML = html; tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(ev.clientX - b.left - tw / 2, b.width - tw)) + "px";
    tip.style.top = ev.clientY - b.top - tip.offsetHeight - 12 + "px";
  }
  function bind(R) {
    const byName = Object.fromEntries(R.map((r) => [r.name, r]));
    svg.querySelectorAll(".sc-row").forEach((row) => {
      const r = byName[row.dataset.name];
      row.addEventListener("pointermove", (e) => {
        const dot = e.target.closest(".sc-dot");
        if (dot) showTip(`<b>${r.name}</b> · ${dot.dataset.rna}<br>${T(MET[metric].label)}: ${fmt(+dot.dataset.v, metric)}${MET[metric].unit}`, e);
        else showTip(`<b>${r.name}</b> · ${T(FAM[r.fam])}<br>${metric === "overall" ? T("Overall score") : T("Mean {m}").replace("{m}", T(MET[metric].label))}: ${fmt(r.means[metric], metric)}${MET[metric].unit}<br><span>${T("{n} of {t} targets predicted").replace("{n}", r.n).replace("{t}", r.total)}</span>`, e);
        row.classList.add("hover");
      });
      row.addEventListener("pointerleave", () => { tip.hidden = true; row.classList.remove("hover"); });
    });
  }

  // controls
  const press = (group, b) => group.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  const dsB = $$("[data-sds]"), mB = $$("[data-smet]"), fB = $$("[data-sfam]");
  dsB.forEach((b) => b.addEventListener("click", () => { ds = b.dataset.sds; press(dsB, b); render(); }));
  mB.forEach((b) => b.addEventListener("click", () => { metric = b.dataset.smet; press(mB, b); render(); }));
  fB.forEach((b) => b.addEventListener("click", () => {
    focus = focus === b.dataset.sfam ? null : b.dataset.sfam;
    fB.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.sfam === focus)));
    svg.querySelectorAll(".sc-row").forEach((el) => el.classList.toggle("dim", !!focus && !el.classList.contains("f-" + focus)));
  }));
  const tb = $("#scTable");
  tb.addEventListener("click", () => { const on = table.hidden; table.hidden = !on; tb.setAttribute("aria-pressed", String(on)); tb.textContent = on ? T("Hide table") : T("Show table"); });
  document.addEventListener("langchange", () => { tb.textContent = table.hidden ? T("Show table") : T("Hide table"); render(); });
  // dataset sizes in the buttons
  dsB.forEach((b) => (b.querySelector("i").textContent = D.datasets[b.dataset.sds].rnas.length));
  new ResizeObserver(() => render()).observe(svg);
  render();
})();

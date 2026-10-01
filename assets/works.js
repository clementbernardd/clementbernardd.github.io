// Thesis works: figure switchers for the benchmarks and a click-to-zoom lightbox
(function () {
  // figure explorers: each [data-figs] block swaps one <img> based on its segmented controls
  document.querySelectorAll("[data-figs]").forEach((box) => {
    const img = box.querySelector("img"), cap = box.querySelector("figcaption"), open = box.querySelector(".fig");
    const state = {};
    box.querySelectorAll("[data-k]").forEach((b) => { if (b.getAttribute("aria-pressed") === "true") state[b.dataset.k] = b.dataset.v; });
    const tpl = box.dataset.figs, caps = JSON.parse(box.dataset.caps || "{}");
    function show() {
      const src = tpl.replace(/\{(\w+)\}/g, (_, k) => state[k]);
      img.classList.add("swap");
      const pre = new Image();
      pre.onload = () => { img.src = src; img.classList.remove("swap"); };
      pre.src = src;
      open.dataset.full = src;
      const label = Object.values(state).map((v) => caps[v] || v).join(" · ");
      img.alt = label; if (cap) cap.textContent = cap.dataset.prefix ? `${cap.dataset.prefix} ${label}` : label;
    }
    box.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => {
      state[b.dataset.k] = b.dataset.v;
      box.querySelectorAll(`[data-k="${b.dataset.k}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      show();
    }));
    show();
  });

  // lightbox
  const dlg = document.getElementById("lightbox");
  if (!dlg || typeof dlg.showModal !== "function") return;
  const big = dlg.querySelector("img");
  document.addEventListener("click", (e) => {
    const f = e.target.closest(".fig");
    if (!f) return;
    e.preventDefault();
    const im = f.querySelector("img");
    big.src = f.dataset.full || im.src; big.alt = im.alt;
    dlg.showModal();
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest(".lb-close")) dlg.close(); });
})();

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(pointer: fine)").matches;
  const root = document.documentElement;
  const T = (s) => (window.I18N ? window.I18N.t(s) : s);

  // toast
  const toastEl = $("#toast");
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2000);
  }

  // theme toggle
  const isDark = () => root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  $("#themeBtn").addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
  });

  // mobile menu
  const nav = $("#nav"), menuBtn = $("#menuBtn");
  const setMenu = (open) => {
    nav.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? T("Close menu") : T("Open menu"));
  };
  menuBtn.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  $$("#menu a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  // scroll progress + back to top
  const bar = $("#progress"), toTop = $("#toTop");
  let ticking = false;
  function onScroll() {
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
    toTop.classList.toggle("show", scrollY > 700);
    ticking = false;
  }
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
  toTop.addEventListener("click", () => scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }));

  // active nav link
  const links = new Map($$("#menu a").map((a) => [a.getAttribute("href").slice(1), a]));
  const secObs = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => a.classList.remove("active"));
      const a = links.get(en.target.id);
      if (a) a.classList.add("active");
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  links.forEach((_, id) => { const s = document.getElementById(id); if (s) secObs.observe(s); });

  // count-up numbers
  function countUp(el) {
    const end = +el.dataset.count, suffix = el.dataset.suffix || "";
    if (reduced) { el.textContent = end + suffix; return; }
    const dur = 1200, t0 = performance.now();
    const step = (t) => {
      const p = Math.min((t - t0) / dur, 1), eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(end * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // scroll reveal
  const revObs = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      el.classList.add("in");
      $$("[data-count]", el).forEach(countUp);
      // drop the reveal classes once shown so hover transforms work again
      const clear = () => el.classList.remove("reveal", "in");
      reduced ? clear() : el.addEventListener("transitionend", clear, { once: true });
      revObs.unobserve(en.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  $$(".reveal").forEach((el) => revObs.observe(el));

  // rotating word in the lede
  const rot = $("#rot");
  const words = ["biology", "RNA folding", "gene synthesis"];
  if (!reduced) {
    let wi = 0;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    (async function loop() {
      for (;;) {
        await sleep(2400);
        const w = rot.textContent; // erase whatever is shown (it may already be translated)
        for (let i = w.length; i >= 0; i--) { rot.textContent = w.slice(0, i); await sleep(45); }
        wi = (wi + 1) % words.length;
        const n = T(words[wi]);
        for (let i = 1; i <= n.length; i++) { rot.textContent = n.slice(0, i); await sleep(80); }
      }
    })();
  }

  // hero spotlight follows the cursor
  const hero = $("#hero");
  if (finePointer && !reduced) {
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty("--mx", e.clientX - r.left + "px");
      hero.style.setProperty("--my", e.clientY - r.top + 40 + "px");
      hero.style.setProperty("--spot", 1);
    });
    hero.addEventListener("pointerleave", () => hero.style.setProperty("--spot", 0));
  }

  // DNA strand: click to flip to the complementary strand
  const seq = "ATGCGTACCTAGGCTAACGTTAGCCATGGATCCGTA";
  const comp = { A: "T", T: "A", G: "C", C: "G" };
  const strand = $("#strand"), label = $("#strandLabel");
  for (let k = 0; k < 2; k++) {
    const t = document.createElement("div");
    t.className = "strand-track";
    for (const b of seq) {
      const d = document.createElement("div");
      d.className = "base " + b;
      d.textContent = b;
      t.appendChild(d);
    }
    strand.appendChild(t);
  }
  let flipped = false;
  function flipStrand() {
    flipped = !flipped;
    label.textContent = flipped ? T("3′ → 5′ (complement)") : "5′ → 3′";
    $$(".strand-track", strand).forEach((track) => {
      Array.from(track.children).forEach((el, i) => {
        const swap = () => {
          const nb = comp[el.textContent];
          el.className = "base " + nb;
          el.textContent = nb;
          if (!reduced) el.classList.add("flip");
        };
        reduced ? swap() : setTimeout(swap, i * 22);
      });
    });
  }
  strand.addEventListener("click", flipStrand);
  strand.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flipStrand(); } });
  strand.addEventListener("animationend", (e) => e.target.classList.remove("flip"));

  // publication filter + search
  const fb = $$(".filters button"), pubs = $$("#pubs .pub");
  const search = $("#pubSearch"), count = $("#pubCount"), empty = $("#pubEmpty");
  let filter = "all";
  function applyPubs() {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    pubs.forEach((li) => {
      const ok = (filter === "all" || li.dataset.t === filter) && (!q || li.textContent.toLowerCase().includes(q));
      li.hidden = !ok;
      if (ok) shown++;
    });
    count.textContent = `${shown} / ${pubs.length}`;
    empty.hidden = shown > 0;
  }
  fb.forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.f;
    fb.forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    applyPubs();
  }));
  search.addEventListener("input", applyPubs);
  applyPubs();

  // skills highlight
  const sk = $("#skillToggle"), grid = $("#skillGrid");
  sk.addEventListener("click", () => {
    const on = grid.classList.toggle("weekly");
    sk.setAttribute("aria-pressed", String(on));
    sk.textContent = on ? T("Show all skills") : T("Highlight core skills");
  });

  // project cards: 3D tilt + glare
  if (finePointer && !reduced) {
    $$(".proj").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.style.transition = "transform .08s linear";
        card.style.transform = `translateY(-4px) rotateX(${(0.5 - y) * 8}deg) rotateY(${(x - 0.5) * 10}deg)`;
        card.style.setProperty("--gx", x * 100 + "%");
        card.style.setProperty("--gy", y * 100 + "%");
      });
      card.addEventListener("pointerleave", () => {
        card.style.transition = "";
        card.style.transform = "";
      });
    });
  }

  // animated double helix in the contact card
  const helix = $("#helix");
  if (helix) {
    const NS = "http://www.w3.org/2000/svg", rungs = 22, colors = ["var(--a)", "var(--t)", "var(--g)", "var(--c)"];
    const mk = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); helix.appendChild(el); return el; };
    const lines = Array.from({ length: rungs }, (_, i) => mk("line", { stroke: colors[i % 4], "stroke-width": 4, "stroke-linecap": "round" }));
    const p1 = mk("path", { fill: "none", stroke: "currentColor", "stroke-width": 3 });
    const p2 = mk("path", { fill: "none", stroke: "currentColor", "stroke-width": 3 });
    let phase = 0, visible = false;
    function draw() {
      let d1 = "", d2 = "";
      for (let y = 0; y <= 300; y += 4) {
        const a = y / 300 * Math.PI * 4 + phase;
        d1 += (y ? "L" : "M") + (60 + Math.sin(a) * 45).toFixed(1) + " " + y;
        d2 += (y ? "L" : "M") + (60 - Math.sin(a) * 45).toFixed(1) + " " + y;
      }
      p1.setAttribute("d", d1); p2.setAttribute("d", d2);
      lines.forEach((ln, i) => {
        const y = 8 + i * (284 / (rungs - 1)), a = y / 300 * Math.PI * 4 + phase, x = Math.sin(a) * 45;
        ln.setAttribute("x1", 60 + x); ln.setAttribute("x2", 60 - x);
        ln.setAttribute("y1", y); ln.setAttribute("y2", y);
      });
    }
    function frame() { if (!visible) return; phase += 0.02; draw(); requestAnimationFrame(frame); }
    draw();
    if (!reduced) {
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) requestAnimationFrame(frame); }).observe(helix);
    }
  }

  // copy email
  const btn = $("#copyBtn"), em = $("#email");
  btn.addEventListener("click", () => {
    const done = () => { btn.textContent = T("Copied ✓"); toast(T("Email copied to clipboard")); setTimeout(() => (btn.textContent = T("Copy email")), 1800); };
    const fallback = () => {
      const r = document.createRange(); r.selectNodeContents(em);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      toast(T("Selected, press Ctrl+C / ⌘C"));
    };
    try { navigator.clipboard.writeText(em.textContent).then(done, fallback); } catch (e) { fallback(); }
  });

  // local time (footer) and year
  const tick = () => {
    try {
      const s = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
      $("#time").textContent = "Paris · " + s;
    } catch (e) {}
  };
  tick(); setInterval(tick, 30000);
  document.addEventListener("langchange", () => { rot.textContent = T(words[0]); });
  $("#year").textContent = new Date().getFullYear();

  console.log("%c ATGC %c Thanks for looking under the hood.", "background:#13152B;color:#FFB800;font-weight:bold;padding:2px 6px;border-radius:4px", "color:inherit");
})();

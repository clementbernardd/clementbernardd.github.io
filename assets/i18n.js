// Tiny i18n layer. English is written in the HTML; French comes from window.I18N_FR (assets/i18n-fr.js),
// keyed by the English text of each segment (the text between tags, whitespace-normalised), so markup,
// links and attributes are kept as they are. Scripts translate their own strings with I18N.t() and
// re-render on the "langchange" event.
(function () {
  const FR = window.I18N_FR || {};
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const INLINE = new Set(["B", "I", "EM", "STRONG", "A", "SUB", "SUP", "CODE", "BR", "SPAN", "SMALL", "MARK"]);
  const SKIP = new Set(["SCRIPT", "STYLE", "SVG", "CANVAS", "VIDEO", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT"]);
  const ATTRS = ["aria-label", "placeholder", "title", "alt"];
  const origHTML = new Map(), origText = new Map(), origAttr = new Map(); // original English, kept per kind
  let lang = "en";

  // an element can be swapped as a whole if it only holds text and inline formatting without ids
  // (scripts keep references to elements with ids, and to everything inside buttons)
  function swappable(el) {
    if (el.tagName === "BUTTON" || !el.firstChild) return false;
    let text = false;
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { if (n.data.trim()) text = true; }
      else if (n.nodeType === 1) {
        if (!INLINE.has(n.tagName) || n.id || n.querySelector("[id], button, input, video, canvas, svg")) return false;
      }
    }
    return text || !!el.querySelector("b, i, a, span, strong, em, code");
  }

  function visit(el, fn) {
    if (SKIP.has(el.tagName) || el.hasAttribute("data-i18n-skip")) return;
    ATTRS.forEach((a) => { if (el.hasAttribute(a)) fn({ kind: "attr", el, a, key: norm(el.getAttribute(a)) }); });
    if (el !== document.body && swappable(el) && !INLINE.has(el.parentElement && el.parentElement.tagName) ) {
      fn({ kind: "html", el, key: norm(el.innerHTML) });
      el.querySelectorAll("*").forEach((c) => ATTRS.forEach((a) => { if (c.hasAttribute(a)) fn({ kind: "attr", el: c, a, key: norm(c.getAttribute(a)) }); }));
      return;
    }
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3 && n.data.trim()) fn({ kind: "text", el: n, key: norm(n.data) });
      else if (n.nodeType === 1) visit(n, fn);
    }
  }

  // translate the text segments of an HTML string, leaving tags untouched
  const scratch = document.createElement("div");
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function seg(text) {
    const k = norm(text), fr = FR[k];
    if (fr == null || !k) return null;
    let lead = text.match(/^\s*/)[0];
    const tail = text.match(/\s*$/)[0];
    if (/^[.,;)]/.test(fr)) lead = ""; // "word ." → "word."
    return lead + fr + tail;
  }
  function translateHTML(html) {
    let changed = false;
    const out = html.split(/(<[^>]+>)/).map((part) => {
      if (!part || part[0] === "<") return part;
      scratch.innerHTML = part;
      const t = seg(scratch.textContent);
      if (t == null) return part;
      changed = true; return esc(t);
    }).join("");
    return changed ? out : null;
  }

  function apply(to) {
    visit(document.body, (it) => {
      if (to === "fr") {
        if (it.kind === "html") { const h = translateHTML(it.el.innerHTML); if (h == null) return; if (!origHTML.has(it.el)) origHTML.set(it.el, it.el.innerHTML); it.el.innerHTML = h; return; }
        const fr = it.kind === "text" ? seg(it.el.data) : FR[it.key];
        if (fr == null) return;
        if (it.kind === "text") { if (!origText.has(it.el)) origText.set(it.el, it.el.data); it.el.data = fr; }
        else { const k = it.el; const o = origAttr.get(k) || {}; if (!(it.a in o)) o[it.a] = k.getAttribute(it.a); origAttr.set(k, o); k.setAttribute(it.a, fr); }
      }
    });
    if (to === "en") {
      origHTML.forEach((v, el) => (el.innerHTML = v));
      origText.forEach((v, node) => (node.data = v));
      origAttr.forEach((v, el) => Object.entries(v).forEach(([a, val]) => el.setAttribute(a, val)));
      origHTML.clear(); origText.clear(); origAttr.clear();
    }
    const md = document.querySelector('meta[name="description"]');
    if (md) { md.dataset.en ||= md.content; md.content = to === "fr" && FR[md.dataset.en] ? FR[md.dataset.en] : md.dataset.en; }
  }

  function set(to, quiet) {
    if (to === lang) return;
    if (lang === "fr") apply("en");
    if (to === "fr") apply("fr");
    lang = to;
    document.documentElement.lang = to;
    try { localStorage.setItem("lang", to); } catch (e) {}
    const b = document.getElementById("langBtn");
    if (b) { b.textContent = to === "fr" ? "EN" : "FR"; b.setAttribute("aria-label", to === "fr" ? "Switch to English" : "Passer en français"); }
    if (!quiet) document.dispatchEvent(new Event("langchange"));
  }

  window.I18N = {
    t: (s) => (lang === "fr" && FR[s] != null ? FR[s] : s),
    get lang() { return lang; },
    set,
    // list every English text segment on the page that has no French yet (to maintain the dictionary)
    missing() {
      const out = new Set();
      visit(document.body, (it) => {
        const parts = it.kind === "html" ? it.el.innerHTML.split(/(<[^>]+>)/).filter((p) => p && p[0] !== "<").map((p) => { scratch.innerHTML = p; return norm(scratch.textContent); }) : [it.key];
        parts.forEach((k) => { if (k && /[A-Za-z]{3,}/.test(k) && FR[k] == null) out.add(k); });
      });
      return Array.from(out);
    },
  };

  // initial language: saved choice, else the browser's
  let saved = null; try { saved = localStorage.getItem("lang"); } catch (e) {}
  const initial = saved || ((navigator.language || "").toLowerCase().startsWith("fr") ? "fr" : "en");
  const btn = document.getElementById("langBtn");
  if (btn) btn.addEventListener("click", () => set(lang === "fr" ? "en" : "fr"));
  if (initial === "fr") set("fr", true); // before the other scripts initialise, so they render in French directly
})();

# clement.b — personal website

Static site (HTML + CSS + vanilla JS, no build step), deployed with GitHub Pages.

```
index.html          page content
assets/style.css    styles (light/dark themes)
assets/main.js      page interactions (theme, nav, reveal, DNA strand…)
assets/rna3d.js     interactive RNA 3D viewer (thesis section)
assets/rna-data.js  RNA coordinates extracted from PDB 1EHZ and 1Y26
assets/ai.js        AI playground: self-attention demo + Q-learning gridworld
.github/workflows/pages.yml   auto-deploy on push to main
```

## Preview locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

1. Create a GitHub repo (name it `<username>.github.io` for a root URL, or anything else for `https://<username>.github.io/<repo>/`).
2. Push this folder to the `main` branch.
3. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Every push to `main` redeploys automatically.

## Editing content

- Text lives in `index.html`.
- Project GIFs: put files in `assets/img/` and replace each `<div class="ph">…</div>` with `<img src="assets/img/name.gif" alt="…">`.
- Counters animate from the `data-count` attribute on stat numbers; keep it in sync with the text.

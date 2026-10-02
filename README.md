# clement.b — personal website

Static site (HTML + CSS + vanilla JS, no build step), deployed with GitHub Pages.

```
index.html          page content
assets/style.css    styles (light/dark themes)
assets/main.js      page interactions (theme, nav, reveal, DNA strand…)
assets/rna3d.js     interactive RNA 3D viewer (thesis section)
assets/rna-data.js  RNA coordinates extracted from PDB 1EHZ and 1Y26
assets/ai.js        AI playground: self-attention demo + Q-learning gridworld
assets/torsion.js   RNA-TorsionBERT lab: rebuild a backbone from torsion angles (NeRF)
assets/torsion-data.js  tRNA 1EHZ backbone atoms, torsions, mean bond lengths/angles
assets/frames.js    frame-based reconstruction demo (rigid nucleotides on R, t frames + RMSD/INF/TM)
assets/frames-data.js  tRNA 1EHZ heavy atoms, frames and averaged nucleotide templates
assets/works.js     figure switchers + lightbox for the thesis works
assets/sotr.js      State-of-the-RNArt explorer (ranking per metric and test set)
assets/sotr-data.js scores from EvryRNA/state_of_the_rnart_viz (best-RMSD model per method and target)
assets/img/         figures from the EvryRNA repos (resized for the web)
assets/projects.js  tutorials, projects, teaching demo (2D superposition), publication sorting
assets/media/       project/tutorial previews (GIFs converted to MP4 + poster frames)
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

## Updating citation numbers

The Research stats and per-paper citation counts are static, copied from Google Scholar on 1 October 2026. Update them in `index.html` (search for `data-count` and `citations`).

## Cache busting

`tools/version_assets.py` stamps every CSS/JS link in `index.html` with a content hash (`?v=...`) so browsers never mix a new page with an old cached script. The deploy workflow runs it automatically; run `python3 tools/version_assets.py` yourself when previewing locally after editing assets.

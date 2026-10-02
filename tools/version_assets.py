"""Stamp every local CSS/JS reference in index.html with a content hash (?v=...),
so browsers never mix a new page with an old cached script. Safe to run repeatedly."""
import hashlib, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
page = root / "index.html"
html = page.read_text(encoding="utf-8")

def stamp(m):
    attr, path = m.group(1), m.group(2)
    digest = hashlib.md5((root / path).read_bytes()).hexdigest()[:8]
    return f'{attr}="{path}?v={digest}"'

new = re.sub(r'(src|href)="(assets/[^"?]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"', stamp, html)
page.write_text(new, encoding="utf-8")
print("versioned", len(re.findall(r"\?v=[0-9a-f]{8}", new)), "asset links")

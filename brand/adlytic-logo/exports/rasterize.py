#!/usr/bin/env python3
"""Rasterize Adlytic logo SVGs to transparent PNGs via headless Chrome."""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ROOT / "exports"
SYSTEM = ROOT / "system"
SIZES = [16, 32, 64, 128, 256, 512, 1024]

ASSETS = {
    "mark": SYSTEM / "mark.svg",
    "mark-mono-black": SYSTEM / "mark-mono-black.svg",
    "mark-mono-white": SYSTEM / "mark-mono-white.svg",
    "favicon": SYSTEM / "favicon.svg",
    "monogram": SYSTEM / "monogram.svg",
    "app-icon": SYSTEM / "app-icon.svg",
}


def html_for(svg: str, size: int) -> str:
    return f"""<!DOCTYPE html>
<html><head><style>
  html,body{{margin:0;padding:0;background:transparent;width:{size}px;height:{size}px;overflow:hidden}}
  img{{display:block;width:{size}px;height:{size}px}}
</style></head>
<body><img src='data:image/svg+xml;utf8,{svg}'/></body></html>"""


def escape_svg(raw: str) -> str:
    return (
        raw.replace("#", "%23")
        .replace("<", "%3C")
        .replace(">", "%3E")
        .replace('"', "%22")
        .replace("\n", "")
        .replace("'", "%27")
    )


def render(svg_path: Path, out: Path, size: int) -> None:
    svg = escape_svg(svg_path.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "page.html"
        page.write_text(html_for(svg, size), encoding="utf-8")
        shot = Path(tmp) / "shot.png"
        cmd = [
            "google-chrome",
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--default-background-color=00000000",
            f"--window-size={size},{size}",
            f"--screenshot={shot}",
            page.as_uri(),
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        out.parent.mkdir(parents=True, exist_ok=True)
        shot.replace(out)


def main() -> None:
    EXPORTS.mkdir(parents=True, exist_ok=True)
    for name, path in ASSETS.items():
        for size in SIZES:
            # favicon/monogram native artboards are small; still export ladder
            out = EXPORTS / f"{name}-{size}.png"
            print(f"render {out.name}")
            render(path, out, size)
    # lockups at useful widths
    for lock_name in ("lockup-horizontal", "lockup-horizontal-on-dark"):
        svg_path = SYSTEM / f"{lock_name}.svg"
        for height in (64, 128, 256):
            width = int(height * 3)
            svg = escape_svg(svg_path.read_text(encoding="utf-8"))
            with tempfile.TemporaryDirectory() as tmp:
                page = Path(tmp) / "page.html"
                page.write_text(
                    f"""<!DOCTYPE html><html><head><style>
                    html,body{{margin:0;background:transparent;width:{width}px;height:{height}px}}
                    img{{width:{width}px;height:{height}px;display:block}}
                    </style></head><body><img src='data:image/svg+xml;utf8,{svg}'/></body></html>""",
                    encoding="utf-8",
                )
                shot = Path(tmp) / "shot.png"
                subprocess.run(
                    [
                        "google-chrome",
                        "--headless=new",
                        "--disable-gpu",
                        "--no-sandbox",
                        "--default-background-color=00000000",
                        f"--window-size={width},{height}",
                        f"--screenshot={shot}",
                        page.as_uri(),
                    ],
                    check=True,
                    capture_output=True,
                )
                out = EXPORTS / f"{lock_name}-{height}.png"
                print(f"render {out.name}")
                shot.replace(out)
    print("done")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
bootstrap-preview-placeholders.py

One-time setup script (mirrors bootstrap-placeholders.js but for the binary
PNG preview assets instead of SVG). Generates on-brand "RENDERING..." static
placeholder images for assets/previews/<scene>.png so the README never shows
a broken image icon before the render-3d-previews.yml workflow has run once
in the actual GitHub repo (where Puppeteer + Chrome + network are available).

This script never runs in CI — the real render-3d.js overwrites every one
of these files with live animated APNG captures.

Usage: python3 scripts/bootstrap-preview-placeholders.py
"""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "previews")
STATIC_DIR = os.path.join(ROOT, "assets", "generated")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

W, H = 480, 300
VOID = (10, 8, 18)
CYAN = (0, 255, 255)
MUTED = (232, 232, 240)

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

SCENES = [
    ("atom",      "QUANTUM ATOM",    "BABYLON.JS PBR"),
    ("dna",       "DNA HELIX",       "BABYLON.JS IRIDESCENCE"),
    ("particles", "THE VOID",        "WEBGPU COMPUTE"),
    ("universe",  "SKILL UNIVERSE",  "OGL MINIMAL WEBGL"),
    ("neural",    "NEURAL NETWORK",  "RAW WEBGL2 INSTANCED"),
    ("wormhole",  "VOID PORTAL",     "RAW WEBGL2 GLSL ES 3.0"),
    ("hologram",  "HOLOGRAM CUBE",   "THREE.JS CSS3D"),
    ("cpu",       "CPU DIE",         "THREE.JS SHARED SHADER"),
]


def load_font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()


def make_placeholder(title, subtitle):
    img = Image.new("RGB", (W, H), VOID)
    draw = ImageDraw.Draw(img)

    # Border
    draw.rectangle([0, 0, W - 1, H - 1], outline=(0, 60, 70), width=1)
    # Left accent bar
    draw.rectangle([0, 0, 2, H], fill=(0, 120, 130))

    # Corner brackets
    bracket_col = (90, 50, 150)
    bl = 14
    draw.line([(10, 10), (10, 10 + bl)], fill=bracket_col, width=2)
    draw.line([(10, 10), (10 + bl, 10)], fill=bracket_col, width=2)
    draw.line([(W - 10, 10), (W - 10, 10 + bl)], fill=bracket_col, width=2)
    draw.line([(W - 10, 10), (W - 10 - bl, 10)], fill=bracket_col, width=2)
    draw.line([(10, H - 10), (10, H - 10 - bl)], fill=bracket_col, width=2)
    draw.line([(10, H - 10), (10 + bl, H - 10)], fill=bracket_col, width=2)
    draw.line([(W - 10, H - 10), (W - 10, H - 10 - bl)], fill=bracket_col, width=2)
    draw.line([(W - 10, H - 10), (W - 10 - bl, H - 10)], fill=bracket_col, width=2)

    title_font = load_font(20)
    sub_font   = load_font(11)
    tiny_font  = load_font(10)

    # Centered title
    tw = draw.textlength(title, font=title_font)
    draw.text(((W - tw) / 2, H / 2 - 26), title, font=title_font, fill=CYAN)

    sw = draw.textlength(subtitle, font=sub_font)
    draw.text(((W - sw) / 2, H / 2 + 2), subtitle, font=sub_font, fill=(0, 200, 210))

    status = "AWAITING FIRST RENDER PASS"
    stw = draw.textlength(status, font=tiny_font)
    draw.text(((W - stw) / 2, H / 2 + 30), status, font=tiny_font, fill=(120, 120, 140))

    return img


created = 0
for name, title, subtitle in SCENES:
    out_path = os.path.join(OUT_DIR, f"{name}.png")
    if os.path.exists(out_path):
        print(f"skip (exists): {name}.png")
        continue
    img = make_placeholder(title, subtitle)
    img.save(out_path, "PNG", optimize=True)
    print(f"created placeholder: assets/previews/{name}.png")
    created += 1

    static_path = os.path.join(STATIC_DIR, f"preview-{name}.png")
    if not os.path.exists(static_path):
        img.save(static_path, "PNG", optimize=True)

print(f"\n{created} placeholder preview(s) created.")
print("These are overwritten automatically by render-3d-previews.yml once it runs with network access.")

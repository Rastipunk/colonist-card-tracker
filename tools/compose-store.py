"""
Builds the Chrome Web Store graphics, per locale, from the raw captures of
tools/shot-store.mjs (tools/out/store/<locale>/) and the anonymised real-game
background (store/old/screenshot-game-1280x800.png, island only):

  store/shots/<locale>/1-promo.png      1280x800  promotional hero (upload first)
  store/shots/<locale>/2-stats.png      1280x800  panel with "More stats" open
  store/shots/<locale>/3-game.png       1280x800  real island + panel
  store/shots/<locale>/4-features.png   1280x800  features board
  store/shots/<locale>/extra-research.png, extra-options.png   optional
  store/marquee-1400x560.png, store/promo-440x280.png          English promo tiles

  python tools/compose-store.py [locale ...]
"""
import os, sys, json
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "tools", "out", "store")
STORE = os.path.join(ROOT, "store")
TEXTS = json.load(open(os.path.join(STORE, "shots-i18n.json"), encoding="utf-8"))
locales = sys.argv[1:] or [k for k in TEXTS if not k.startswith("_")]

DARK = (16, 20, 28)
FONT_DIR = r"C:\Windows\Fonts"
# Segoe UI covers Latin, Cyrillic and Greek; CJK locales use the system fonts Chrome uses too.
FONTS = {
    "default": ("segoeui.ttf", "segoeuib.ttf"),
    "zh_CN": ("msyh.ttc", "msyhbd.ttc"),
    "ja": ("YuGothM.ttc", "YuGothB.ttc"),
    "ko": ("malgun.ttf", "malgunbd.ttf"),
}
def font(size, bold=False, locale="en"):
    reg, b = FONTS.get(locale, FONTS["default"])
    p = os.path.join(FONT_DIR, b if bold else reg)
    if not os.path.exists(p):
        p = os.path.join(FONT_DIR, "arialbd.ttf" if bold else "arial.ttf")
    return ImageFont.truetype(p, size)

def fit(draw, text, f, max_w, locale):
    """Shrink the font until the text fits max_w (captions differ a lot per language)."""
    size = f.size
    while draw.textlength(text, font=f) > max_w and size > 14:
        size -= 2
        f = font(size, f.path.lower().endswith(("b.ttf", "bd.ttc", "bd.ttf", "b.ttc")), locale)
    return f

def wrap(draw, text, f, max_w):
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def wrap_cjk(draw, text, f, max_w):
    lines, cur = [], ""
    for ch in text:
        if draw.textlength(cur + ch, font=f) <= max_w:
            cur += ch
        else:
            lines.append(cur); cur = ch
    if cur: lines.append(cur)
    return lines

def draw_wrapped(draw, xy, text, f, fill, max_w, locale, line_gap=6):
    x, y = xy
    lines = wrap_cjk(draw, text, f, max_w) if locale in ("zh_CN", "ja") else wrap(draw, text, f, max_w)
    for ln in lines:
        draw.text((x, y), ln, font=f, fill=fill)
        y += f.size + line_gap
    return y

def shadow(canvas, box, radius=18, alpha=110):
    x0, y0, x1, y1 = box
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle((x0 + 6, y0 + 10, x1 + 6, y1 + 10), radius=12, fill=(0, 0, 0, alpha))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(radius)))

def downscale(img, factor=2):
    return img.resize((img.width // factor, img.height // factor), Image.LANCZOS)

# ---------------------------------------------------------------- background
game = Image.open(os.path.join(STORE, "old", "screenshot-game-1280x800.png")).convert("RGBA")
LIGHT = game.getpixel((300, 60))[:3]
BLUE = game.getpixel((60, 60))[:3]
island = game.crop((225, 165, 725, 690))
mask = Image.new("L", island.size, 0)
ImageDraw.Draw(mask).ellipse((10, 10, island.width - 10, island.height - 10), fill=255)
island.putalpha(mask.filter(ImageFilter.GaussianBlur(28)))
blur_bg = game.copy()
ImageDraw.Draw(blur_bg).rectangle((705, 0, 1280, 515), fill=BLUE + (255,))
blur_bg = blur_bg.filter(ImageFilter.GaussianBlur(14))

def caption(canvas, title, sub, locale, y_title=44):
    d = ImageDraw.Draw(canvas)
    f1 = fit(d, title, font(44, True, locale), 1150, locale)
    d.text((64, y_title), title, font=f1, fill=(255, 255, 255))
    f2 = font(22, False, locale)
    return draw_wrapped(d, (66, y_title + f1.size + 16), sub, f2, (226, 236, 246), 1150, locale)

def closeup(img2x, title, sub, out, locale, scale=0.9):
    canvas = Image.new("RGBA", (1280, 800), BLUE + (255,))
    canvas.alpha_composite(Image.blend(canvas, blur_bg, 0.45))
    bottom = caption(canvas, title, sub, locale)
    top = max(bottom + 12, 170)
    max_h = 800 - top - 20
    w, h = int(img2x.width * scale), int(img2x.height * scale)
    im = img2x.resize((w, h), Image.LANCZOS)
    if h > max_h:
        im = im.resize((int(w * max_h / h), max_h), Image.LANCZOS)
    x = (1280 - im.width) // 2
    y = top + (max_h - im.height) // 2
    shadow(canvas, (x, y, x + im.width, y + im.height))
    canvas.alpha_composite(im, (x, y))
    canvas.convert("RGB").save(out)

def hero_game(panel, title, sub, out, locale):
    s = Image.new("RGBA", (1280, 800), LIGHT + (255,))
    bottom = caption(s, title, sub, locale)
    top = max(bottom + 10, 175)
    s.alpha_composite(island, (40, max(top, 190)))
    sc = min(0.93, (800 - top - 20) / panel.height)
    ph = panel.resize((int(panel.width * sc), int(panel.height * sc)), Image.LANCZOS)
    x, y = 1280 - ph.width - 56, top + max(0, (800 - top - 20 - ph.height) // 2)
    shadow(s, (x, y, x + ph.width, y + ph.height))
    s.alpha_composite(ph, (x, y))
    s.convert("RGB").save(out)

def promo(panel, t, size, out, locale, title_size, sub_size, bullet_size, pad, panel_scale):
    W, H = size
    canvas = Image.new("RGBA", size, DARK + (255,))
    acc = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(acc).polygon([(int(W * 0.50), 0), (W, 0), (W, H), (int(W * 0.40), H)], fill=(38, 96, 150, 255))
    canvas.alpha_composite(acc)
    d = ImageDraw.Draw(canvas)
    left_w = int(W * 0.44) - pad
    y = pad
    ft = font(title_size, True, locale)
    for ln in ("Colonist Card", "Tracker") if W >= 1000 else ("Colonist Card Tracker",):
        d.text((pad, y), ln, font=ft, fill=(255, 255, 255)); y += int(ft.size * 1.12)
    y += int(ft.size * 0.3)
    fs = fit(d, t["tagline"], font(sub_size, False, locale), left_w, locale)
    d.text((pad + 2, y), t["tagline"], font=fs, fill=(255, 217, 138)); y += fs.size + 26
    fb = font(bullet_size, False, locale)
    for b in t["bullets"]:
        y = draw_wrapped(d, (pad + 2, y), "•  " + b, fb, (201, 211, 222), left_w, locale, line_gap=4) + 6
    sc = min(panel_scale, (H - 2 * 24) / panel.height)
    im = panel.resize((int(panel.width * sc), int(panel.height * sc)), Image.LANCZOS)
    x, yy = W - im.width - pad, (H - im.height) // 2
    shadow(canvas, (x, yy, x + im.width, yy + im.height))
    canvas.alpha_composite(im, (x, yy))
    canvas.convert("RGB").save(out)

for locale in locales:
    t = TEXTS[locale]
    raw = os.path.join(RAW, locale)
    if not os.path.isdir(raw):
        print(locale, "sin capturas"); continue
    out_dir = os.path.join(STORE, "shots", locale)
    os.makedirs(out_dir, exist_ok=True)
    load = lambda n: Image.open(os.path.join(raw, n)).convert("RGBA")
    panel, panel_stats, consent, options, features = load("panel-range.png"), load("panel-stats.png"), load("consent.png"), load("options.png"), load("features.png")

    promo(panel, t, (1280, 800), os.path.join(out_dir, "1-promo.png"), locale, 62, 26, 23, 60, 0.8)
    closeup(panel_stats, t["stats"][0], t["stats"][1], os.path.join(out_dir, "2-stats.png"), locale)
    hero_game(panel, t["game"][0], t["game"][1], os.path.join(out_dir, "3-game.png"), locale)
    (downscale(features) if features.width > 1280 else features).convert("RGB").save(os.path.join(out_dir, "4-features.png"))
    closeup(consent, t["game"][0], t["game"][1], os.path.join(out_dir, "extra-research.png"), locale)
    o = downscale(options) if options.width > 1280 else options
    o.convert("RGB").crop((0, 0, 1280, 800)).save(os.path.join(out_dir, "extra-options.png"))

    if locale == "en":
        promo(panel, t, (1400, 560), os.path.join(STORE, "marquee-1400x560.png"), locale, 54, 26, 22, 56, 0.9)
        promo(panel, t, (440, 280), os.path.join(STORE, "promo-440x280.png"), locale, 20, 12, 11, 14, 0.27)
    print(locale, "ok")

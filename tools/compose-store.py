"""
Builds the Chrome Web Store graphics from the raw captures of tools/shot-store.mjs
and the anonymised real-game background (store/old/screenshot-game-1280x800.png,
the 1.1.0 capture; only its game area is used, the old panel is patched over):

  store/shots/1-game.png        1280x800  real game with the panel (English)
  store/shots/2-steals.png      1280x800  panel close-up: hidden steal as probabilities
  store/shots/3-expected.png    1280x800  expected-value mode
  store/shots/4-research.png    1280x800  consent card over the game
  store/shots/5-options.png     1280x800  options page
  store/marquee-1400x560.png    marquee promo tile
  store/promo-440x280.png       small promo tile

  python tools/compose-store.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "tools", "out", "store")
STORE = os.path.join(ROOT, "store")
SHOTS = os.path.join(STORE, "shots")
os.makedirs(SHOTS, exist_ok=True)

BLUE = (49, 144, 207)
DARK = (16, 20, 28)
FONT_DIR = r"C:\Windows\Fonts"
def font(size, bold=False):
    for name in (["segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf"]):
        p = os.path.join(FONT_DIR, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def load(name):
    return Image.open(os.path.join(RAW, name)).convert("RGBA")

def downscale(img, factor=2):
    return img.resize((img.width // factor, img.height // factor), Image.LANCZOS)

def shadow(canvas, box, radius=18, alpha=110):
    x0, y0, x1, y1 = box
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((x0 + 6, y0 + 10, x1 + 6, y1 + 10), radius=12, fill=(0, 0, 0, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(radius))
    canvas.alpha_composite(layer)

# ---------------------------------------------------------------- background
game = Image.open(os.path.join(STORE, "old", "screenshot-game-1280x800.png")).convert("RGBA")
# cover the old panel (top-right) with a stretched strip of the page's own background
# (keeps the subtle vertical gradient of the capture, so the patch is invisible)
BLUE = game.getpixel((60, 60))[:3]
bg = game.copy()
# The old panel occupied x 715..1215, y 0..508. Columns x=180 (left of the board) and
# x=1250 (right of the old panel) are untouched background for every row, so each row
# of the patch is a linear blend between those two samples: this follows both the
# vertical and the horizontal gradient of the page without touching the board.
X0, X1, Y1 = 705, 1280, 515
LX, RX = 704, 1250
px = bg.load()
def is_bg(c):
    r, g, b = c[:3]
    return b > r + 40 and b > g          # the page blue, not a board hex
# left samples: the column just left of the patch, skipping rows where the board touches it
left = [game.getpixel((LX, yy))[:3] for yy in range(0, Y1)]
ok_rows = [yy for yy in range(0, Y1) if is_bg(left[yy])]
for yy in range(0, Y1):
    if not is_bg(left[yy]):
        near = min(ok_rows, key=lambda k: abs(k - yy))
        left[yy] = left[near]
for yy in range(0, Y1):
    l = left[yy]
    r = game.getpixel((RX, yy))[:3]
    for xx in range(X0, X1):
        t = min(1.0, max(0.0, (xx - LX) / (RX - LX)))
        px[xx, yy] = tuple(int(round(l[i] + (r[i] - l[i]) * t)) for i in range(3)) + (255,)

panel = load("panel-range.png")          # captured at 2x (deviceScaleFactor 2)
panel_exp = load("panel-expected.png")
consent = load("consent.png")
options = load("options.png")

# 1) hero: the real island (feathered) next to the panel at readable size.
#    The capture's background has a dark halo around the island and the old panel's
#    shadow, so it is not patched; the island is cut out with a soft mask instead.
LIGHT = game.getpixel((300, 60))[:3]
s1 = Image.new("RGBA", (1280, 800), LIGHT + (255,))
d = ImageDraw.Draw(s1)
d.text((64, 44), "Who holds what, every turn", font=font(44, True), fill=(255, 255, 255))
d.text((66, 104), "Live on colonist.io: resources per player, bank, development cards and dice", font=font(22), fill=(226, 236, 246))
isl = game.crop((225, 165, 725, 690))                       # island only, no names, no old panel
mask = Image.new("L", isl.size, 0)
ImageDraw.Draw(mask).ellipse((10, 10, isl.width - 10, isl.height - 10), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(28))
isl.putalpha(mask)
s1.alpha_composite(isl, (40, 190))
hero_scale = min(0.93, 590 / panel.height)          # fit under the caption whatever the panel height
ph = panel.resize((int(panel.width * hero_scale), int(panel.height * hero_scale)), Image.LANCZOS)
x, y = 1280 - ph.width - 56, 175 + max(0, (590 - ph.height) // 2)
shadow(s1, (x, y, x + ph.width, y + ph.height))
s1.alpha_composite(ph, (x, y))
s1.convert("RGB").save(os.path.join(SHOTS, "1-game.png"))

def closeup(img2x, caption, sub, name, scale=1.0):
    canvas = Image.new("RGBA", (1280, 800), BLUE + (255,))
    # soft blurred game behind (without the old panel)
    blur = bg.resize((1280, 800)).filter(ImageFilter.GaussianBlur(14))
    canvas.alpha_composite(Image.blend(canvas, blur, 0.45))
    d = ImageDraw.Draw(canvas)
    d.text((64, 52), caption, font=font(44, True), fill=(255, 255, 255))
    d.text((66, 112), sub, font=font(22), fill=(226, 236, 246))
    w = int(img2x.width * scale)
    h = int(img2x.height * scale)
    im = img2x.resize((w, h), Image.LANCZOS)
    max_h = 800 - 190
    if h > max_h:
        im = im.resize((int(w * max_h / h), max_h), Image.LANCZOS)
    x = (1280 - im.width) // 2
    y = 170 + (max_h - im.height) // 2
    shadow(canvas, (x, y, x + im.width, y + im.height))
    canvas.alpha_composite(im, (x, y))
    canvas.convert("RGB").save(os.path.join(SHOTS, name))

closeup(panel, "Every hidden steal becomes a probability", "5 +1 60% means five cards for sure and a 60% chance of one more, refined with every move",
        "2-steals.png", scale=0.9)
closeup(panel_exp, "Or read the expected value at a glance", "Same game, one click on % — plus bank, development cards and the dice histogram",
        "3-expected.png", scale=0.9)
closeup(consent, "Free, open research, anonymous by design", "Player names are replaced by codes before anything leaves your browser; you decide first",
        "4-research.png", scale=0.9)

# 5) options page, already 1280x800 at 1x? it was captured at 2x -> downscale
o = downscale(options) if options.width > 1280 else options
o = o.crop((0, 0, 1280, 800)) if o.width >= 1280 and o.height >= 800 else o
s5 = Image.new("RGBA", (1280, 800), (15, 19, 25, 255))
s5.alpha_composite(o, ((1280 - o.width) // 2, 0))
s5.convert("RGB").save(os.path.join(SHOTS, "5-options.png"))

# ---------------------------------------------------------------- promo tiles
def tile(size, title_size, sub_size, bullets, panel_scale, name, pad):
    W, H = size
    canvas = Image.new("RGBA", size, DARK + (255,))
    # diagonal blue accent
    acc = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(acc).polygon([(int(W * 0.52), 0), (W, 0), (W, H), (int(W * 0.42), H)], fill=(38, 96, 150, 255))
    canvas.alpha_composite(acc)
    d = ImageDraw.Draw(canvas)
    d.text((pad, pad), "Colonist Card Tracker", font=font(title_size, True), fill=(255, 255, 255))
    d.text((pad + 2, pad + title_size + 10), "Catan card counter for colonist.io", font=font(sub_size), fill=(255, 217, 138))
    yy = pad + title_size + sub_size + 34
    for b in bullets:
        d.text((pad + 2, yy), "•  " + b, font=font(sub_size - 2), fill=(201, 211, 222))
        yy += sub_size + 8
    im = panel.resize((int(panel.width * panel_scale), int(panel.height * panel_scale)), Image.LANCZOS)
    x = W - im.width - pad // 2
    y = (H - im.height) // 2 if im.height < H - 20 else 10
    if im.height > H - 20:
        im = im.crop((0, 0, im.width, H - 20)); y = 10
    shadow(canvas, (x, y, x + im.width, y + im.height))
    canvas.alpha_composite(im, (x, y))
    canvas.convert("RGB").save(os.path.join(STORE, name))

tile((1400, 560), 54, 26, ["Who holds what, every turn", "Hidden steals as probabilities", "Bank, development cards, dice", "15 languages · free · open source"],
     0.9, "marquee-1400x560.png", 56)
tile((440, 280), 20, 12, ["Hidden steals as odds", "Bank, dev cards, dice", "15 languages, free"], 0.27, "promo-440x280.png", 14)
print("ok:", os.listdir(SHOTS))

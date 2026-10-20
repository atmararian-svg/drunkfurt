"""
Dresses the walking man as the stranger: his clothes are re-made from the
fabric of the first attacker scan (tan canvas jacket, washed-out denim) and
worn down (grime, stains, frayed hems, a torn knee); shoes are scuffed, face
and hands weathered. Writes JPEG/PNG textures for tools/dressAttacker.mjs.

Usage: python3 tools/dress_textures.py <Mr_Man textures dir> <scan colour texture> <out dir>
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

src, scan_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(7)
scan = Image.open(scan_path).convert('RGB')


def load(name, size=None):
    im = Image.open(os.path.join(src, name))
    if size:
        im = im.resize((size, size), Image.LANCZOS)
    return im


def swatch(box, size):
    """A patch of the scan's fabric, mirrored into a seamless tile and filled out to `size`."""
    p = np.asarray(scan.crop(box)).astype(np.float32)
    tile = np.concatenate([p, p[:, ::-1]], axis=1)
    tile = np.concatenate([tile, tile[::-1]], axis=0)
    reps = (size // tile.shape[0] + 1, size // tile.shape[1] + 1, 1)
    return np.tile(tile, reps)[:size, :size]


def noise(size, scale, seed):
    """Smooth value noise in 0..1."""
    g = np.random.default_rng(seed).random((max(2, size // scale), max(2, size // scale)))
    return np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)).astype(np.float32) / 255


def grime(rgb, amount, seed, stains=6):
    """Darkens with blotchy dirt and a few stains, the way worn clothes go."""
    s = rgb.shape[0]
    dirt = noise(s, 64, seed) * 0.6 + noise(s, 16, seed + 1) * 0.4
    rgb = rgb * (1 - amount * np.clip((dirt - 0.35) * 1.6, 0, 1))[..., None]
    yy, xx = np.mgrid[0:s, 0:s]
    for i in range(stains):
        cx, cy, r = rng.integers(0, s), rng.integers(0, s), rng.integers(s // 40, s // 14)
        m = np.clip(1 - np.hypot(xx - cx, yy - cy) / r, 0, 1) ** 1.5
        rgb = rgb * (1 - 0.35 * m)[..., None]
    return rgb


def island_mask(img, thresh=12):
    """Where the original garment texture has content (its UV islands), softened at the edges."""
    a = np.asarray(img.convert('L')).astype(np.float32)
    m = (a > thresh).astype(np.float32)
    return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))).astype(np.float32) / 255


def keep_detail(new_rgb, old_img, k):
    """Carries the original's seams, folds and buttons (its luminance detail) into the new fabric."""
    old = np.asarray(old_img.convert('L')).astype(np.float32)
    blur = np.asarray(Image.fromarray(old.astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32)
    detail = (old - blur) / 255
    return new_rgb * (1 + k * detail)[..., None]


def save(rgb, name, quality=86):
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(os.path.join(out, name), quality=quality)


S = 512
# --- the jacket: tan canvas from the scan, faded and filthy, over his shirt's cut
top = load('Mr_Man_Top_Diffuse.png', S)
# the most uniform tan patch of the scan's jacket, with a canvas weave added
fabric = swatch((200, 936, 240, 976), S) * (0.92 + 0.12 * noise(S, 2, 3))[..., None]
fabric = keep_detail(fabric, top, 0.6)
fabric = grime(fabric, 0.55, 11, stains=9)
m = island_mask(top)
save(fabric * m[..., None], 'top.jpg')

# --- trousers: washed-out denim, dirt at the knees and the hems, one knee torn open
bottom = load('Mr_Man_Bottom_Diffuse.png', S)
# the most uniform patch of the scan's jeans
denim = swatch((80, 808, 120, 848), S) * 1.12
denim = keep_detail(denim, bottom, 0.5)
denim = grime(denim, 0.5, 21, stains=7)
yy, xx = np.mgrid[0:S, 0:S]
# a ragged tear on one knee: lighter threads and a dark gap
tear = np.clip(1 - np.hypot((xx - S * 0.36) / 30, (yy - S * 0.52) / 14), 0, 1)
denim = denim * (1 - 0.6 * (tear > 0.55))[..., None] + 200 * ((tear > 0.2) & (tear <= 0.55) & (noise(S, 4, 5) > 0.5))[..., None] * 0.6
# frayed, dirtier hems at the bottom of the legs
denim = denim * (1 - 0.35 * np.clip((yy / S - 0.86) * 8, 0, 1))[..., None]
save(denim * island_mask(bottom)[..., None], 'bottom.jpg')

# --- shoes: scuffed and caked
shoes = np.asarray(load('Mr_Man_Shoes_Diffuse.png', S).convert('RGB')).astype(np.float32)
shoes = grime(shoes * 0.95 + 8, 0.45, 31, stains=10)
save(shoes, 'shoes.jpg')

# --- skin: weathered, dirt on the hands and around the face
B = 1024
body = np.asarray(load('Mr_Man_Body_Diffuse.png').convert('RGB')).astype(np.float32)
body = grime(body, 0.3, 41, stains=5)
save(body * 0.93, 'body.jpg', quality=88)

# --- beard and moustache: colour with the opacity in alpha (hair cards)
for part in ['Beard', 'Moustache']:
    c = load(f'Mr_Man_{part}_Diffuse.png', 256).convert('RGB')
    a = load(f'Mr_Man_{part}_Opacity.png', 256).convert('L')
    rgba = c.copy()
    rgba.putalpha(a)
    rgba.save(os.path.join(out, part.lower() + '.png'))

# --- normal maps for the clothes and the body (reduced)
for name, size in [('Top', 512), ('Bottom', 512), ('Body', 512)]:
    load(f'Mr_Man_{name}_Normal.png', size).convert('RGB').save(os.path.join(out, name.lower() + '_n.jpg'), quality=85)
print('textures written to', out)

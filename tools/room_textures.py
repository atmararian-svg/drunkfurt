"""
The surveillance room's baked lighting, printed in Drunkfurt's tones.

The supplied room (Sketchfab "Surveillance room" by wa_rouk) is unlit: its
light is baked into three 4096 px atlases, in a strong yellow-green. This
keeps the light and drops the colour: each atlas becomes a grey luminance
map, stretched so the darkest baked shade is near black and the brightest
near white (a little gamma keeps the shadows deep), and reduced in size. The
comic pass then bands it like every other surface.

Usage: python3 tools/room_textures.py <room .glb> <out dir>
Writes floor.jpg (1024), cables.jpg (2048), shading.jpg (2048), in the
order of the model's images (0 floor, 1 cables, 2 everything else).
"""
import io
import json
import os
import struct
import sys

import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
b = open(src, 'rb').read()
n = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + n])
binc = b[20 + n + 8:]
for i, (name, size) in enumerate([('floor', 1024), ('cables', 2048), ('shading', 2048)]):
    bv = j['bufferViews'][j['images'][i]['bufferView']]
    img = Image.open(io.BytesIO(binc[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB')
    a = np.asarray(img).astype(np.float32) / 255
    lum = a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    lo, hi = np.percentile(lum, 2), np.percentile(lum, 99.5)
    v = np.clip((lum - lo) / max(1e-6, hi - lo), 0, 1) ** 1.15
    g = Image.fromarray((v * 255).astype(np.uint8), 'L').resize((size, size), Image.LANCZOS)
    path = os.path.join(out, name + '.jpg')
    g.save(path, quality=82, optimize=True)
    print(f'{name}: {size}px, {os.path.getsize(path) / 1e6:.2f} MB')

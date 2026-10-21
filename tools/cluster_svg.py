"""
Adapts the supplied instrument-cluster illustration (Vecteezy, "car dashboard
UI illustration", free licence: credit Vecteezy.com) into the Mercedes'
instrument cluster for episode 3. Writes src/assets/cluster.svg.

What the original holds (inspected element by element):
  - left:   a tachometer, 0-10 (x1000 rpm), red zone 6-10, 22.5 degrees per
            1,000 rpm, centre (339, 625). Kept: it is a tachometer, so its
            rpm labels stay rpm.
  - centre: a speedometer labelled 0-160 (mph) whose labels are not even
            evenly spaced (0-120 at 45 degrees per 20, then 140 and 160
            squeezed into the bottom), centre (702, 625), with a grey
            rectangular panel in the middle ("12.24v" and a battery icon,
            two lines, a small triangle above it).
  - right:  a 0-100 level gauge (fuel). Kept.
  - a grey cowl arc over everything. Dropped: the car has a real one.

The speedometer is rebuilt for km/h rather than relabelled: its ticks,
labels and ring are removed and a 0-300 km/h scale is drawn in the same
style (ticks every 10 km/h, major ticks and labels every 50, a 270 degree
sweep from bottom left to bottom right, the ring and start dot redrawn to
match the sweep). The centre panel is removed. Colours move from cyan to an
AMG-like cluster: near-black face, white and grey markings, red accents.
The needles are not part of the graphic; they are drawn live (carCluster.ts).

Usage: python3 tools/cluster_svg.py <original .svg> src/assets/cluster.svg
"""
import math
import sys
import xml.etree.ElementTree as ET

SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
src, out = sys.argv[1], sys.argv[2]
tree = ET.parse(src)
root = tree.getroot()


def node(path):
    """An element by its position in the original's structure, e.g. '1.1.0.63'."""
    el = root
    for i in path.split('.'):
        el = list(el)[int(i)]
    return el


def remove(*paths):
    targets = [node(p) for p in paths]
    parents = {c: p for p in root.iter() for c in p}
    for t in targets:
        parents[t].remove(t)


# --- what goes (collected first, removed together, so the indices stay valid)
speedo_marks = [f'1.1.0.{i}' for i in range(0, 31)]  # the speedometer's ticks and its 0-160 labels
remove(
    *speedo_marks,
    '1.1.0.31', '1.1.0.32',  # its ring and start dot (redrawn for the 0-300 sweep)
    '1.1.0.63',  # the rectangular centre panel
    '1.1.0.64',  # the triangle above it
    '1.1.1', '1.1.2', '1.1.3', '1.1.4',  # the panel's battery icon, lines and "12.24v"
    '1.1.5',  # the cowl arc
)

# --- recolour: cyan to white/grey, the red to an AMG red, the face near-black
style = root.find(f'{{{SVG}}}style')
css = style.text
for a, b in [('#2FBACC', '#c9c8c3'), ('#EFEFEF', '#f1f0e9'), ('#DD5E5E', '#d4212b')]:
    css = css.replace(a, b)
style.text = css
for rect in root.iter(f'{{{SVG}}}rect'):
    if rect.get('width') == '1400':
        rect.set('style', 'fill:#0b0b0c')

# --- the new speedometer: 0-300 km/h
CX, CY = 702.0, 625.0
SWEEP0, SWEEP = 225.0, 270.0  # compass degrees: 0 km/h bottom left, 300 bottom right
VMAX = 300


def at(v, r):
    a = math.radians(SWEEP0 + SWEEP * v / VMAX)
    return CX + r * math.sin(a), CY - r * math.cos(a)


g = ET.SubElement(node('1.1'), f'{{{SVG}}}g', {'id': 'speedometer-kmh'})
# the ring, over the sweep only, and its dot at zero (as the original's)
x0, y0 = at(0, 214)
x1, y1 = at(VMAX, 214)
ET.SubElement(g, f'{{{SVG}}}path', {
    'd': f'M{x0:.1f},{y0:.1f} A214,214 0 1,1 {x1:.1f},{y1:.1f}',
    'style': 'fill:none;stroke:#5d5d5b;stroke-width:3;stroke-linecap:round',
})
ET.SubElement(g, f'{{{SVG}}}circle', {'cx': f'{x0:.1f}', 'cy': f'{y0:.1f}', 'r': '6', 'style': 'fill:#d4212b'})
for v in range(0, VMAX + 1, 10):
    major = v % 50 == 0
    xa, ya = at(v, 166 if major else 176)
    xb, yb = at(v, 189)
    ET.SubElement(g, f'{{{SVG}}}line', {
        'x1': f'{xa:.1f}', 'y1': f'{ya:.1f}', 'x2': f'{xb:.1f}', 'y2': f'{yb:.1f}',
        'style': f'stroke:{"#f1f0e9" if major else "#9a9995"};stroke-width:{3.5 if major else 2};stroke-linecap:round',
    })
    if major:
        xt, yt = at(v, 138)
        t = ET.SubElement(g, f'{{{SVG}}}text', {
            'x': f'{xt:.1f}', 'y': f'{yt + 9:.1f}', 'text-anchor': 'middle',
            'style': 'fill:#f1f0e9;font-family:Arial,Helvetica,sans-serif;font-size:27px;font-weight:600',
        })
        t.text = str(v)
unit = ET.SubElement(g, f'{{{SVG}}}text', {
    'x': f'{CX:.0f}', 'y': f'{CY + 88:.0f}', 'text-anchor': 'middle',
    'style': 'fill:#8c8b87;font-family:Arial,Helvetica,sans-serif;font-size:20px;letter-spacing:1px',
})
unit.text = 'km/h'
# the tachometer's unit, which the original leaves out
rpm = ET.SubElement(node('1.1'), f'{{{SVG}}}text', {
    'x': '339', 'y': '700', 'text-anchor': 'middle',
    'style': 'fill:#8c8b87;font-family:Arial,Helvetica,sans-serif;font-size:15px;letter-spacing:1px',
})
rpm.text = 'x1000 rpm'

# --- the cluster's screen is about 3:1; crop to the three dials at that shape
root.set('viewBox', '51 405 1302 440')
root.set('width', '1302')
root.set('height', '440')
root.attrib.pop('style', None)
tree.write(out, xml_declaration=False, encoding='unicode')
print('wrote', out)

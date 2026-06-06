#!/usr/bin/env python3
"""
Generate 100 image-based IQ-style puzzle questions as SVG files plus a
manifest (questions.json) consumed by the web app.

Design:
- Every question is a single self-contained SVG (portrait, mobile-friendly).
- The four answer choices are drawn INTO the image, labeled A-D.
- The UI only needs to show A/B/C/D tap buttons; the manifest stores the
  correct index (0-3). This keeps the data model uniform across question types.

Question types (all procedurally generated with a known correct answer):
  1. number-sequence    "Which number comes next?"
  2. letter-sequence    "Which letter comes next?"
  3. odd-one-out         "Which one is the odd one out?"
  4. shape-progression   "Which shape completes the pattern?"

Run:  python3 scripts/generate_questions.py
Output: public/questions/q001.svg ... q100.svg  and  src/data/questions.json
"""

import json
import math
import os
import random
from collections import Counter

SEED = 20260606
rng = random.Random(SEED)

OUT_IMG_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "questions")
OUT_MANIFEST = os.path.join(os.path.dirname(__file__), "..", "src", "data", "questions.json")

W, H = 400, 540
INK = "#1f2933"
ACCENT = "#3b5bdb"
PAPER = "#ffffff"
BOXBG = "#f1f3f9"
BOXLINE = "#c3cae0"

# ---------------------------------------------------------------------------
# SVG primitives
# ---------------------------------------------------------------------------

def svg_open():
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
        f'width="{W}" height="{H}" font-family="Verdana,Arial,sans-serif">'
        f'<rect x="0" y="0" width="{W}" height="{H}" fill="{PAPER}"/>'
    )


def svg_close():
    return "</svg>"


def text(x, y, s, size=22, fill=INK, anchor="middle", weight="normal"):
    return (
        f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" '
        f'text-anchor="{anchor}" font-weight="{weight}" '
        f'dominant-baseline="middle">{s}</text>'
    )


def title(prompt):
    # size shrinks for longer prompts so they never clip the 400px viewBox
    size = 20 if len(prompt) <= 26 else 17
    return text(W / 2, 40, prompt, size=size, fill=ACCENT, weight="bold")


def rounded_rect(x, y, w, h, fill=BOXBG, stroke=BOXLINE, rx=12, sw=2):
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
        f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
    )


def poly_points(cx, cy, r, sides, rotation_deg=0):
    pts = []
    for i in range(sides):
        ang = math.radians(rotation_deg - 90 + i * 360 / sides)
        pts.append(f"{cx + r * math.cos(ang):.1f},{cy + r * math.sin(ang):.1f}")
    return " ".join(pts)


def shape(kind, cx, cy, r, color=INK, rotation=0, fill="none", sw=4):
    """Draw a shape by kind. Returns SVG string."""
    if kind == "circle":
        return f'<circle cx="{cx}" cy="{cy}" r="{r}" stroke="{color}" stroke-width="{sw}" fill="{fill}"/>'
    if kind == "square":
        return (
            f'<g transform="rotate({rotation} {cx} {cy})">'
            f'<rect x="{cx-r}" y="{cy-r}" width="{2*r}" height="{2*r}" rx="4" '
            f'stroke="{color}" stroke-width="{sw}" fill="{fill}"/></g>'
        )
    sides = {"triangle": 3, "diamond": 4, "pentagon": 5, "hexagon": 6}.get(kind)
    if sides:
        rot = rotation + (45 if kind == "diamond" else 0)
        return (
            f'<polygon points="{poly_points(cx, cy, r, sides, rot)}" '
            f'stroke="{color}" stroke-width="{sw}" fill="{fill}" stroke-linejoin="round"/>'
        )
    if kind == "star":
        pts = []
        for i in range(10):
            rr = r if i % 2 == 0 else r * 0.45
            ang = math.radians(rotation - 90 + i * 36)
            pts.append(f"{cx + rr*math.cos(ang):.1f},{cy + rr*math.sin(ang):.1f}")
        return (
            f'<polygon points="{" ".join(pts)}" stroke="{color}" '
            f'stroke-width="{sw}" fill="{fill}" stroke-linejoin="round"/>'
        )
    if kind == "arrow":
        return (
            f'<g transform="rotate({rotation} {cx} {cy})">'
            f'<line x1="{cx-r}" y1="{cy}" x2="{cx+r}" y2="{cy}" stroke="{color}" stroke-width="{sw}" stroke-linecap="round"/>'
            f'<polyline points="{cx+r-12},{cy-10} {cx+r},{cy} {cx+r-12},{cy+10}" '
            f'stroke="{color}" stroke-width="{sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
            f'</g>'
        )
    raise ValueError(f"unknown shape {kind}")


def dots_shape(cx, cy, r, n, color=INK):
    """A rounded square containing n dots (1-9) arranged in a grid."""
    out = [rounded_rect(cx - r, cy - r, 2 * r, 2 * r, fill="none", stroke=color, sw=3)]
    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    inner = 2 * r - 24
    placed = 0
    for ry in range(rows):
        for cxn in range(cols):
            if placed >= n:
                break
            px = cx - r + 12 + inner / cols * cxn + inner / cols / 2
            py = cy - r + 12 + inner / rows * ry + inner / rows / 2
            out.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="6" fill="{color}"/>')
            placed += 1
    return "".join(out)


# ---------------------------------------------------------------------------
# Option boxes (2x2 grid of A/B/C/D)
# ---------------------------------------------------------------------------

OPT_LABELS = ["A", "B", "C", "D"]


def option_grid(render_content):
    """render_content(slot_index, cx, cy, r) -> svg string for slot 0..3."""
    out = []
    bx, by = 30, 330
    bw, bh = 165, 95
    gap_x, gap_y = 10, 10
    r = 32
    for i in range(4):
        col, row = i % 2, i // 2
        x = bx + col * (bw + gap_x)
        y = by + row * (bh + gap_y)
        cx, cy = x + bw / 2 + 14, y + bh / 2
        out.append(rounded_rect(x, y, bw, bh))
        out.append(text(x + 16, y + 18, OPT_LABELS[i], size=18, fill=ACCENT, anchor="middle", weight="bold"))
        out.append(render_content(i, cx, cy, r))
    return "".join(out)


def shuffle_with_answer(choices, correct_value):
    """Shuffle choice values; return (ordered_list, correct_index)."""
    items = list(choices)
    rng.shuffle(items)
    return items, items.index(correct_value)


# ---------------------------------------------------------------------------
# Generators  (each returns: inner_svg, correct_index, category)
# ---------------------------------------------------------------------------

def gen_number_sequence():
    kind = rng.choice(["arith", "geom", "fib", "square", "alt"])
    if kind == "arith":
        a, d = rng.randint(1, 9), rng.randint(2, 9)
        seq = [a + d * i for i in range(5)]
        ans = a + d * 5
    elif kind == "geom":
        a, r = rng.randint(1, 4), rng.randint(2, 3)
        seq = [a * r ** i for i in range(5)]
        ans = a * r ** 5
    elif kind == "fib":
        x, y = rng.randint(1, 5), rng.randint(2, 7)
        seq = [x, y]
        for _ in range(3):
            seq.append(seq[-1] + seq[-2])
        ans = seq[-1] + seq[-2]
    elif kind == "square":
        start = rng.randint(1, 4)
        seq = [(start + i) ** 2 for i in range(5)]
        ans = (start + 5) ** 2
    else:  # alternating two steps
        a = rng.randint(1, 8)
        d1, d2 = rng.randint(2, 6), rng.randint(2, 6)
        seq = [a]
        for i in range(4):
            seq.append(seq[-1] + (d1 if i % 2 == 0 else d2))
        ans = seq[-1] + d1

    distractors = set()
    for delta in (1, -1, 2, -2, 3, max(2, ans // 5)):
        v = ans + delta
        if v != ans and v > 0:
            distractors.add(v)
    distractors = sorted(distractors)  # sort first so output is reproducible
    rng.shuffle(distractors)
    choices = [ans] + distractors[:3]
    ordered, correct = shuffle_with_answer(choices, ans)

    body = [title("Which number comes next?")]
    n = len(seq)
    cellw = 56
    total = n * cellw + 50
    startx = (W - total) / 2
    for i, v in enumerate(seq):
        x = startx + i * cellw
        body.append(rounded_rect(x, 150, 48, 48, fill=BOXBG))
        body.append(text(x + 24, 174, str(v), size=20))
    qx = startx + n * cellw + 2
    body.append(rounded_rect(qx, 150, 48, 48, fill="#fff3bf", stroke="#f0b429"))
    body.append(text(qx + 24, 174, "?", size=24, fill="#b07908", weight="bold"))

    body.append(option_grid(lambda i, cx, cy, r: text(cx, cy, str(ordered[i]), size=24)))
    meta = {"seq": list(seq), "options": list(ordered), "answer": ans}
    return "".join(body), correct, "numeric", meta


def gen_letter_sequence():
    a = rng.randint(0, 12)
    d = rng.choice([1, 2, 3, 4])
    ans_idx = a + d * 5
    to_letter = lambda i: chr(ord("A") + (i % 26))
    seq = [to_letter(a + d * i) for i in range(5)]
    ans = to_letter(ans_idx)

    distractors = set()
    for delta in (1, -1, 2, -2, d, -d):
        v = to_letter(ans_idx + delta)
        if v != ans:
            distractors.add(v)
    distractors = sorted(distractors)  # sort first so output is reproducible
    rng.shuffle(distractors)
    choices = [ans] + distractors[:3]
    ordered, correct = shuffle_with_answer(choices, ans)

    body = [title("Which letter comes next?")]
    n = len(seq)
    cellw = 56
    total = n * cellw + 50
    startx = (W - total) / 2
    for i, v in enumerate(seq):
        x = startx + i * cellw
        body.append(rounded_rect(x, 150, 48, 48, fill=BOXBG))
        body.append(text(x + 24, 174, v, size=22, weight="bold"))
    qx = startx + n * cellw + 2
    body.append(rounded_rect(qx, 150, 48, 48, fill="#fff3bf", stroke="#f0b429"))
    body.append(text(qx + 24, 174, "?", size=24, fill="#b07908", weight="bold"))

    body.append(option_grid(lambda i, cx, cy, r: text(cx, cy, ordered[i], size=26, weight="bold")))
    meta = {"seq": list(seq), "options": list(ordered), "answer": ans, "step": d}
    return "".join(body), correct, "verbal", meta


def gen_odd_one_out():
    palette = ["#1f2933", "#e8590c", "#2b8a3e", "#5f3dc4", "#c92a2a"]
    shapes = ["circle", "triangle", "square", "pentagon", "hexagon", "star", "diamond"]
    mode = rng.choice(["shape", "color", "rotation", "fillstate"])
    base_shape = rng.choice(shapes)
    base_color = rng.choice(palette)
    odd = rng.randint(0, 3)
    slots = []

    if mode == "shape":
        other = rng.choice([s for s in shapes if s != base_shape])
        for i in range(4):
            slots.append({"kind": other if i == odd else base_shape, "color": base_color, "rot": 0, "fill": "none"})
    elif mode == "color":
        other = rng.choice([c for c in palette if c != base_color])
        for i in range(4):
            slots.append({"kind": base_shape, "color": other if i == odd else base_color, "rot": 0, "fill": "none"})
    elif mode == "rotation":
        # A rotated circle looks identical, so it can never be the odd one.
        if base_shape == "circle":
            base_shape = rng.choice([s for s in shapes if s != "circle"])
        base_rot = rng.choice([0, 15, 30])
        for i in range(4):
            slots.append({"kind": base_shape, "color": base_color, "rot": (base_rot + 40) if i == odd else base_rot, "fill": "none"})
    else:  # fillstate
        for i in range(4):
            slots.append({"kind": base_shape, "color": base_color, "rot": 0, "fill": base_color if i == odd else "none"})

    body = [title("Which one is the odd one out?")]
    body.append(text(W / 2, 120, "Compare the four shapes below.", size=14, fill="#828ba3"))
    body.append(option_grid(lambda i, cx, cy, r: shape(
        slots[i]["kind"], cx, cy, r - 4, color=slots[i]["color"],
        rotation=slots[i]["rot"], fill=slots[i]["fill"])))
    meta = {"kind": "odd-one-out", "mode": mode, "odd": odd,
            "slots": [(s["kind"], s["color"], s["rot"], s["fill"]) for s in slots]}
    return "".join(body), odd, "spatial", meta


def gen_shape_progression():
    mode = rng.choice(["count", "rotation", "sides"])
    body = [title("Which shape completes the pattern?")]
    positions = [80, 175, 270]

    if mode == "count":
        start = rng.randint(1, 3)
        seq_counts = [start + i for i in range(3)]
        ans_count = start + 3
        for idx, c in enumerate(seq_counts):
            body.append(dots_shape(positions[idx], 175, 34, c))
        body.append(rounded_rect(330 - 34, 175 - 34, 68, 68, fill="#fff3bf", stroke="#f0b429"))
        body.append(text(330, 175, "?", size=28, fill="#b07908", weight="bold"))
        cand = [ans_count]
        for d in (1, -1, 2):
            if ans_count + d > 0 and (ans_count + d) not in cand:
                cand.append(ans_count + d)
        while len(cand) < 4:
            cand.append(max(cand) + 1)
        ordered, correct = shuffle_with_answer(cand[:4], ans_count)
        body.append(option_grid(lambda i, cx, cy, r: dots_shape(cx, cy, r - 2, ordered[i])))
        meta = {"kind": "progression", "mode": "count", "seq": list(seq_counts),
                "options": list(ordered), "answer": ans_count}
        return "".join(body), correct, "spatial", meta

    if mode == "rotation":
        step = rng.choice([45, 90])
        start = rng.choice([0, 45, 90])
        ans_rot = (start + step * 3) % 360
        for idx in range(3):
            body.append(shape("arrow", positions[idx], 175, 28, color=ACCENT, rotation=(start + step * idx) % 360))
        body.append(rounded_rect(330 - 34, 175 - 34, 68, 68, fill="#fff3bf", stroke="#f0b429"))
        body.append(text(330, 175, "?", size=28, fill="#b07908", weight="bold"))
        cand = [ans_rot]
        for d in (step, -step, 2 * step):
            v = (ans_rot + d) % 360
            if v not in cand:
                cand.append(v)
        while len(cand) < 4:
            cand.append((max(cand) + 30) % 360)
        ordered, correct = shuffle_with_answer(cand[:4], ans_rot)
        body.append(option_grid(lambda i, cx, cy, r: shape("arrow", cx, cy, r - 4, color=ACCENT, rotation=ordered[i])))
        meta = {"kind": "progression", "mode": "rotation",
                "seq": [(start + step * idx) % 360 for idx in range(3)], "step": step,
                "options": list(ordered), "answer": ans_rot}
        return "".join(body), correct, "spatial", meta

    # sides: regular polygon with increasing number of sides (3,4,5 -> 6)
    kindmap = {3: "triangle", 4: "square", 5: "pentagon", 6: "hexagon"}
    seq_sides = [3, 4, 5]
    ans_sides = 6
    for idx, s in enumerate(seq_sides):
        body.append(shape(kindmap[s], positions[idx], 175, 28, color=ACCENT))
    body.append(rounded_rect(330 - 34, 175 - 34, 68, 68, fill="#fff3bf", stroke="#f0b429"))
    body.append(text(330, 175, "?", size=28, fill="#b07908", weight="bold"))
    cand = [ans_sides, 5, 4, 3]  # only the hexagon (6) continues the pattern
    ordered, correct = shuffle_with_answer(cand, ans_sides)
    body.append(option_grid(lambda i, cx, cy, r: shape(kindmap[ordered[i]], cx, cy, r - 4, color=ACCENT)))
    meta = {"kind": "progression", "mode": "sides", "seq": list(seq_sides),
            "options": list(ordered), "answer": ans_sides}
    return "".join(body), correct, "spatial", meta


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

PLAN = (
    [("number-sequence", gen_number_sequence)] * 30
    + [("letter-sequence", gen_letter_sequence)] * 20
    + [("odd-one-out", gen_odd_one_out)] * 25
    + [("shape-progression", gen_shape_progression)] * 25
)


def main():
    os.makedirs(OUT_IMG_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(OUT_MANIFEST), exist_ok=True)
    manifest = []
    verify = []
    for i, (qtype, gen) in enumerate(PLAN, start=1):
        inner, correct, category, meta = gen()
        svg = svg_open() + inner + svg_close()
        fname = f"q{i:03d}.svg"
        with open(os.path.join(OUT_IMG_DIR, fname), "w") as f:
            f.write(svg)
        entry = {
            "id": f"q{i:03d}",
            "image": f"/questions/{fname}",
            "type": qtype,
            "category": category,
            "options": OPT_LABELS,
            "correctIndex": correct,
        }
        manifest.append(entry)
        verify.append({"id": entry["id"], "type": qtype, "correctIndex": correct, "meta": meta})
    rng.shuffle(manifest)  # mix types so the pool order isn't grouped
    with open(OUT_MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2)
    # Sidecar describing exactly what each image draws, for the verifier.
    with open(os.path.join(os.path.dirname(__file__), "verify_data.json"), "w") as f:
        json.dump(verify, f, indent=2)
    print(f"Generated {len(manifest)} questions -> {OUT_IMG_DIR}")
    print(f"Manifest -> {OUT_MANIFEST}")
    print("By type:", dict(Counter(m["type"] for m in manifest)))
    print("Answer index distribution:", dict(Counter(m["correctIndex"] for m in manifest)))


if __name__ == "__main__":
    main()

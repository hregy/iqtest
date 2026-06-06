#!/usr/bin/env python3
"""
Generate 100 image-based, purely-visual IQ puzzles as SVG files plus a
manifest (questions.json) consumed by the web app.

Every question is a single self-contained SVG (portrait, 400x540) with the
four answer choices drawn into the 2x2 grid at the bottom (labeled A-D). The
web UI overlays tap targets on those four boxes, so the layout of the option
grid must stay fixed (see option_grid + HOTSPOTS in src/screens/Question.tsx).

Question types (all procedurally generated, single unambiguous answer):
  1. matrix-reasoning   "Find the missing piece" (3x3 Raven's-style)   -> pattern
  2. visual-analogy     "A is to B as C is to ?"                        -> analogy
  3. odd-one-out        "Which one is the odd one out?"                 -> spatial
  4. shape-progression  "Which shape completes the pattern?"            -> series

Run:  python3 scripts/generate_questions.py
"""

import json
import math
import os
from collections import Counter
import random

SEED = 20260606
rng = random.Random(SEED)

OUT_IMG_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "questions")
OUT_MANIFEST = os.path.join(os.path.dirname(__file__), "..", "src", "data", "questions.json")

W, H = 400, 540
INK = "#1f2933"
ACCENT = "#3b5bdb"
MUTED = "#828ba3"
PAPER = "#ffffff"
BOXBG = "#f1f3f9"
BOXLINE = "#c3cae0"

PAL = ["#1f2933", "#e8590c", "#2b8a3e", "#5f3dc4", "#c92a2a", "#1c7ed6"]
SHAPES = ["circle", "triangle", "square", "pentagon", "hexagon", "star", "diamond"]
# Shapes whose rotation is visually obvious (used when rotation is a variable).
ROT_VIS = ["triangle", "pentagon", "star", "arrow"]
OPT_LABELS = ["A", "B", "C", "D"]

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
    size = 20 if len(prompt) <= 26 else 17
    return text(W / 2, 40, prompt, size=size, fill=ACCENT, weight="bold")


def rounded_rect(x, y, w, h, fill=BOXBG, stroke=BOXLINE, rx=12, sw=2):
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
        f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
    )


def qbox(cx, cy, half):
    """The yellow '?' box used for the missing cell."""
    return (
        rounded_rect(cx - half, cy - half, 2 * half, 2 * half, fill="#fff3bf", stroke="#f0b429")
        + text(cx, cy, "?", size=int(half * 1.1), fill="#b07908", weight="bold")
    )


def poly_points(cx, cy, r, sides, rotation_deg=0):
    pts = []
    for i in range(sides):
        ang = math.radians(rotation_deg - 90 + i * 360 / sides)
        pts.append(f"{cx + r * math.cos(ang):.1f},{cy + r * math.sin(ang):.1f}")
    return " ".join(pts)


def shape(kind, cx, cy, r, color=INK, rotation=0, fill="none", sw=4):
    if kind == "circle":
        return f'<circle cx="{cx}" cy="{cy}" r="{r}" stroke="{color}" stroke-width="{sw}" fill="{fill}"/>'
    if kind == "square":
        return (
            f'<g transform="rotate({rotation} {cx} {cy})">'
            f'<rect x="{cx-r}" y="{cy-r}" width="{2*r}" height="{2*r}" rx="3" '
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
            f'<polyline points="{cx+r-10},{cy-9} {cx+r},{cy} {cx+r-10},{cy+9}" '
            f'stroke="{color}" stroke-width="{sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
            f'</g>'
        )
    raise ValueError(f"unknown shape {kind}")


# ---------------------------------------------------------------------------
# Shape "spec": one dict describes a drawn element across all puzzle types.
# ---------------------------------------------------------------------------

def base_spec():
    return {"shape": "circle", "color": INK, "rot": 0, "fill": "none", "scale": 1.0, "count": 1}


def sig(s):
    """Hashable signature for distinctness / comparison."""
    return (s["shape"], s["color"], int(s.get("rot", 0)) % 360,
            s.get("fill", "none"), round(s.get("scale", 1.0), 2), int(s.get("count", 1)))


def render_spec(cx, cy, r, s):
    kind = s["shape"]
    color = s["color"]
    rot = s.get("rot", 0)
    fill = s.get("fill", "none")
    scale = s.get("scale", 1.0)
    count = int(s.get("count", 1))
    rr = r * scale
    if count <= 1:
        return shape(kind, cx, cy, rr, color=color, rotation=rot, fill=fill, sw=4)
    cols = math.ceil(math.sqrt(count))
    rows = math.ceil(count / cols)
    step = (r * 1.8) / max(cols, rows)
    mini = step * 0.42
    out = []
    placed = 0
    for ry in range(rows):
        for cc in range(cols):
            if placed >= count:
                break
            px = cx - (cols - 1) * step / 2 + cc * step
            py = cy - (rows - 1) * step / 2 + ry * step
            out.append(shape(kind, px, py, mini, color=color, rotation=rot, fill=fill, sw=3))
            placed += 1
    return "".join(out)


def set_attr(s, attr, val):
    if attr == "count":
        s["count"] = val
    elif attr == "shape":
        s["shape"] = val
    elif attr == "rot":
        s["rot"] = val
    elif attr == "color":
        s["color"] = val
    elif attr == "size":
        s["scale"] = val


def values_for(attr):
    if attr == "count":
        return [1, 2, 3]
    if attr == "rot":
        return [0, 90, 180]
    if attr == "size":
        return [0.55, 0.8, 1.1]
    if attr == "color":
        return rng.sample(PAL, 3)
    if attr == "shape":
        return rng.sample(SHAPES, 3)
    raise ValueError(attr)


# ---------------------------------------------------------------------------
# Option grid (2x2 A/B/C/D) -- layout fixed; mirrored by HOTSPOTS in the app.
# ---------------------------------------------------------------------------

def option_grid(render_content):
    out = []
    bx, by = 30, 330
    bw, bh = 165, 95
    gap_x, gap_y = 10, 10
    r = 30
    for i in range(4):
        col, row = i % 2, i // 2
        x = bx + col * (bw + gap_x)
        y = by + row * (bh + gap_y)
        cx, cy = x + bw / 2, y + bh / 2
        out.append(rounded_rect(x, y, bw, bh))
        out.append(text(x + 16, y + 18, OPT_LABELS[i], size=18, fill=ACCENT, weight="bold"))
        out.append(render_content(i, cx, cy, r))
    return "".join(out)


def shuffle_options(options, answer_index):
    order = list(range(len(options)))
    rng.shuffle(order)
    ordered = [options[i] for i in order]
    return ordered, order.index(answer_index)


# ---------------------------------------------------------------------------
# 1) Matrix reasoning (3x3)
# ---------------------------------------------------------------------------

def gen_matrix():
    # Choose two independent attributes: one varies by column, one by row.
    if rng.random() < 0.45:
        col_attr = "rot"
        row_attr = rng.choice(["count", "color", "size"])
    else:
        col_attr, row_attr = rng.sample(["count", "color", "shape", "size"], 2)
    if rng.random() < 0.5:
        col_attr, row_attr = row_attr, col_attr

    base = base_spec()
    if "shape" not in (col_attr, row_attr):
        base["shape"] = rng.choice(ROT_VIS if "rot" in (col_attr, row_attr) else SHAPES)
    if "color" not in (col_attr, row_attr):
        base["color"] = rng.choice(PAL)

    col_vals = values_for(col_attr)
    row_vals = values_for(row_attr)

    grid = [[None] * 3 for _ in range(3)]
    for r in range(3):
        for c in range(3):
            s = dict(base)
            set_attr(s, col_attr, col_vals[c])
            set_attr(s, row_attr, row_vals[r])
            grid[r][c] = s
    answer = dict(grid[2][2])

    # Plausible distractors: combinations that appear elsewhere in the grid.
    seen = {sig(answer)}
    distract = []
    pool = []
    for cv in col_vals[:2]:
        s = dict(answer); set_attr(s, col_attr, cv); pool.append(s)
    for rv in row_vals[:2]:
        s = dict(answer); set_attr(s, row_attr, rv); pool.append(s)
    s = dict(answer); set_attr(s, col_attr, col_vals[0]); set_attr(s, row_attr, row_vals[0]); pool.append(s)
    for s in pool:
        if sig(s) not in seen:
            seen.add(sig(s)); distract.append(s)
    while len(distract) < 3:
        s = dict(answer)
        set_attr(s, col_attr, rng.choice(col_vals))
        set_attr(s, row_attr, rng.choice(row_vals))
        if sig(s) not in seen:
            seen.add(sig(s)); distract.append(s)
    rng.shuffle(distract)
    options = [answer] + distract[:3]
    ordered, correct = shuffle_options(options, 0)

    # ---- draw ----
    body = [title("Find the missing piece")]
    gx, gy, cell = 95, 66, 70
    for r in range(3):
        for c in range(3):
            x, y = gx + c * cell, gy + r * cell
            cx, cy = x + cell / 2, y + cell / 2
            if (r, c) == (2, 2):
                body.append(qbox(cx, cy, 30))
            else:
                body.append(rounded_rect(x + 4, y + 4, cell - 8, cell - 8,
                                         fill="#f8f9fd", stroke=BOXLINE, rx=10, sw=1.5))
                body.append(render_spec(cx, cy, 19, grid[r][c]))
    body.append(option_grid(lambda i, cx, cy, r: render_spec(cx, cy, r, ordered[i])))

    grid_meta = [[(None if (r, c) == (2, 2) else grid[r][c]) for c in range(3)] for r in range(3)]
    meta = {"kind": "matrix", "colAttr": col_attr, "rowAttr": row_attr,
            "grid": grid_meta, "answer": answer, "options": ordered}
    return "".join(body), correct, "pattern", meta


# ---------------------------------------------------------------------------
# 2) Visual analogy  (A : B :: C : ?)
# ---------------------------------------------------------------------------

def apply_transform(s, t):
    out = dict(s)
    k = t["kind"]
    if k == "rot":
        out["rot"] = (out.get("rot", 0) + t["deg"]) % 360
    elif k == "fill":
        out["fill"] = out["color"] if out.get("fill", "none") == "none" else "none"
    elif k == "color":
        out["color"] = t["to"]
    elif k == "size":
        out["scale"] = round(out.get("scale", 1.0) * t["factor"], 2)
    return out


def gen_analogy():
    kind = rng.choice(["rot", "fill", "color", "size"])
    if kind == "rot":
        t = {"kind": "rot", "deg": rng.choice([90, 180])}
        sa, sc = rng.sample(ROT_VIS, 2)
        A = dict(base_spec(), shape=sa, color=rng.choice(PAL))
        C = dict(base_spec(), shape=sc, color=rng.choice(PAL))
    elif kind == "fill":
        t = {"kind": "fill"}
        sa, sc = rng.sample(SHAPES, 2)
        col = rng.choice(PAL)
        A = dict(base_spec(), shape=sa, color=col, fill="none")
        C = dict(base_spec(), shape=sc, color=rng.choice(PAL), fill="none")
    elif kind == "color":
        to = rng.choice(PAL)
        t = {"kind": "color", "to": to}
        sa, sc = rng.sample(SHAPES, 2)
        ca = rng.choice([p for p in PAL if p != to])
        cc = rng.choice([p for p in PAL if p != to])
        A = dict(base_spec(), shape=sa, color=ca)
        C = dict(base_spec(), shape=sc, color=cc)
    else:  # size
        t = {"kind": "size", "factor": rng.choice([0.55, 1.6])}
        sa, sc = rng.sample(SHAPES, 2)
        A = dict(base_spec(), shape=sa, color=rng.choice(PAL))
        C = dict(base_spec(), shape=sc, color=rng.choice(PAL))

    B = apply_transform(A, t)
    answer = apply_transform(C, t)

    # Distractors: wrong transforms applied to C (identity + others).
    seen = {sig(answer)}
    pool = [dict(C)]  # "no change"
    if kind == "rot":
        for d in (90, 180, 270):
            pool.append(dict(C, rot=(C.get("rot", 0) + d) % 360))
    elif kind == "fill":
        pool.append(dict(C, fill=C["color"]))
        pool.append(dict(C, color=rng.choice([p for p in PAL if p != C["color"]])))
        pool.append(dict(C, rot=(C.get("rot", 0) + 90) % 360))
    elif kind == "color":
        for col in PAL:
            pool.append(dict(C, color=col))
    else:  # size
        for f in (0.55, 0.8, 1.3, 1.6):
            pool.append(dict(C, scale=round(C.get("scale", 1.0) * f, 2)))
    distract = []
    for s in pool:
        if sig(s) not in seen:
            seen.add(sig(s)); distract.append(s)
    while len(distract) < 3:
        s = dict(C, color=rng.choice(PAL), rot=(C.get("rot", 0) + rng.choice([90, 180])) % 360)
        if sig(s) not in seen:
            seen.add(sig(s)); distract.append(s)
    rng.shuffle(distract)
    options = [answer] + distract[:3]
    ordered, correct = shuffle_options(options, 0)

    # ---- draw ----
    body = [title("A is to B as C is to ?")]
    body.append(render_spec(85, 120, 30, A))
    body.append(shape("arrow", 200, 120, 24, color=MUTED, sw=4))
    body.append(render_spec(305, 120, 30, B))
    body.append(text(85, 168, "A", size=13, fill=MUTED))
    body.append(text(305, 168, "B", size=13, fill=MUTED))
    body.append(render_spec(85, 235, 30, C))
    body.append(shape("arrow", 200, 235, 24, color=MUTED, sw=4))
    body.append(qbox(305, 235, 30))
    body.append(text(85, 283, "C", size=13, fill=MUTED))
    body.append(option_grid(lambda i, cx, cy, r: render_spec(cx, cy, r, ordered[i])))

    meta = {"kind": "analogy", "transform": t, "A": A, "B": B, "C": C,
            "answer": answer, "options": ordered}
    return "".join(body), correct, "analogy", meta


# ---------------------------------------------------------------------------
# 3) Odd-one-out  (harder: includes size + combined-attribute backgrounds)
# ---------------------------------------------------------------------------

def gen_odd():
    mode = rng.choice(["shape", "color", "rotation", "fillstate", "size"])
    odd = rng.randint(0, 3)

    base = base_spec()
    base["color"] = rng.choice(PAL)
    base["shape"] = rng.choice(ROT_VIS if mode == "rotation" else SHAPES)
    base["rot"] = rng.choice([0, 20]) if mode != "rotation" else rng.choice([0, 15, 30])

    slots = [dict(base) for _ in range(4)]
    if mode == "shape":
        other = rng.choice([s for s in SHAPES if s != base["shape"]])
        slots[odd]["shape"] = other
    elif mode == "color":
        other = rng.choice([c for c in PAL if c != base["color"]])
        slots[odd]["color"] = other
    elif mode == "rotation":
        slots[odd]["rot"] = (base["rot"] + 40) % 360
    elif mode == "fillstate":
        slots[odd]["fill"] = base["color"]
    else:  # size
        slots[odd]["scale"] = 0.55 if base.get("scale", 1.0) >= 0.9 else 1.15

    body = [title("Which one is the odd one out?")]
    body.append(text(W / 2, 120, "Three are alike — find the different one.", size=13, fill=MUTED))
    body.append(option_grid(lambda i, cx, cy, r: render_spec(cx, cy, r, slots[i])))

    meta = {"kind": "odd", "mode": mode, "odd": odd, "slots": slots}
    return "".join(body), odd, "spatial", meta


# ---------------------------------------------------------------------------
# 4) Shape progression / series  (count, rotation, sides, size)
# ---------------------------------------------------------------------------

SIDES_KIND = {3: "triangle", 4: "square", 5: "pentagon", 6: "hexagon"}


def gen_progression():
    mode = rng.choice(["count", "rotation", "sides", "size"])
    base = base_spec()
    base["color"] = ACCENT

    if mode == "count":
        start = rng.randint(1, 3)
        seq_vals = [start, start + 1, start + 2]
        ans_val = start + 3
        opts = [ans_val, ans_val - 1, ans_val + 1, max(1, ans_val - 2)]
        base["shape"] = rng.choice(["circle", "square", "star", "triangle"])
        to_spec = lambda v: dict(base, count=v)
    elif mode == "rotation":
        step = rng.choice([45, 90])
        seq_vals = [0, step, step * 2]
        ans_val = (step * 3) % 360
        opts = [ans_val, (ans_val + step) % 360, (ans_val - step) % 360, (ans_val + 2 * step) % 360]
        base["shape"] = "arrow"
        to_spec = lambda v: dict(base, rot=v)
    elif mode == "sides":
        seq_vals = [3, 4, 5]
        ans_val = 6
        opts = [6, 5, 4, 3]
        to_spec = lambda v: dict(base, shape=SIDES_KIND[v])
    else:  # size
        seq_vals = [1.2, 1.0, 0.8]
        ans_val = 0.6
        opts = [0.6, 0.8, 1.0, 0.45]
        base["shape"] = rng.choice(["circle", "square", "hexagon", "triangle"])
        to_spec = lambda v: dict(base, scale=round(v, 2))

    # de-dup option values while keeping the answer
    uniq = []
    for v in opts:
        if v not in uniq:
            uniq.append(v)
    while len(uniq) < 4:
        uniq.append(uniq[-1] + (1 if mode in ("count",) else 0) + 0.01)
    opt_vals = uniq[:4]
    ordered_vals, correct = shuffle_options(opt_vals, opt_vals.index(ans_val))

    body = [title("Which shape completes the pattern?")]
    positions = [80, 175, 270]
    for i, v in enumerate(seq_vals):
        body.append(render_spec(positions[i], 180, 28, to_spec(v)))
    body.append(qbox(335, 180, 32))
    body.append(option_grid(lambda i, cx, cy, r: render_spec(cx, cy, r, to_spec(ordered_vals[i]))))

    meta = {"kind": "progression", "mode": mode, "seq_vals": seq_vals,
            "answer_val": ans_val, "opt_vals": ordered_vals, "correct": correct}
    return "".join(body), correct, "series", meta


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

PLAN = (
    [("matrix-reasoning", gen_matrix)] * 35
    + [("visual-analogy", gen_analogy)] * 25
    + [("odd-one-out", gen_odd)] * 20
    + [("shape-progression", gen_progression)] * 20
)


def main():
    os.makedirs(OUT_IMG_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(OUT_MANIFEST), exist_ok=True)
    # clear any stale images from a previous (different-sized) run
    for f in os.listdir(OUT_IMG_DIR):
        if f.endswith(".svg"):
            os.remove(os.path.join(OUT_IMG_DIR, f))

    manifest, verify = [], []
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

    rng.shuffle(manifest)
    with open(OUT_MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2)
    with open(os.path.join(os.path.dirname(__file__), "verify_data.json"), "w") as f:
        json.dump(verify, f, indent=2)

    print(f"Generated {len(manifest)} questions -> {OUT_IMG_DIR}")
    print("By type:", dict(Counter(m["type"] for m in manifest)))
    print("By category:", dict(Counter(m["category"] for m in manifest)))
    print("Answer index distribution:", dict(Counter(m["correctIndex"] for m in manifest)))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Generate 100 image-based, purely-visual IQ puzzles in DECOUPLED form:

  for each question we emit
    - one PUZZLE image (the prompt graphic; omitted for odd-one-out)
    - four OPTION images (the tappable answer tiles)
  plus a server-only seed file (scripts/seed_data.json) that contains the
  correct index and verification metadata. The correct answer is NEVER part
  of anything shipped to the browser; the backend scores submissions.

Outputs:
  scripts/seed_assets/qNNN_puzzle.svg
  scripts/seed_assets/qNNN_opt0.svg .. qNNN_opt3.svg
  scripts/seed_data.json

Question types (single unambiguous answer):
  matrix-reasoning   (pattern)  | visual-analogy (analogy)
  odd-one-out        (spatial)  | shape-progression (series)

Run:  python3 scripts/generate_questions.py
"""

import json
import math
import os
from collections import Counter
import random

SEED = 20260606
rng = random.Random(SEED)

HERE = os.path.dirname(__file__)
ASSET_DIR = os.path.join(HERE, "seed_assets")
SEED_DATA = os.path.join(HERE, "seed_data.json")

INK = "#1f2933"
ACCENT = "#3b5bdb"
MUTED = "#828ba3"
BOXLINE = "#c3cae0"

PAL = ["#1f2933", "#e8590c", "#2b8a3e", "#5f3dc4", "#c92a2a", "#1c7ed6"]
SHAPES = ["circle", "triangle", "square", "pentagon", "hexagon", "star", "diamond"]
# Rotation is only UNMISTAKABLE on these (arrows point; a triangle is clearly
# oriented). Polygons like pentagon/hexagon/star look nearly identical when
# rotated, so they must NOT be used when rotation distinguishes the answer.
ROT_CLEAR = ["arrow", "triangle"]

OPT_W, OPT_H = 160, 120  # option tile canvas

# ---------------------------------------------------------------------------
# SVG primitives
# ---------------------------------------------------------------------------

def svg_doc(w, h, inner):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'width="{w}" height="{h}" font-family="Verdana,Arial,sans-serif">{inner}</svg>'
    )


def text(x, y, s, size=22, fill=INK, anchor="middle", weight="normal"):
    return (
        f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" '
        f'text-anchor="{anchor}" font-weight="{weight}" dominant-baseline="middle">{s}</text>'
    )


def rounded_rect(x, y, w, h, fill="none", stroke=BOXLINE, rx=12, sw=2):
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
        f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
    )


def qbox(cx, cy, half):
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
# Shape "spec" shared by rendering + verification
# ---------------------------------------------------------------------------

def base_spec():
    return {"shape": "circle", "color": INK, "rot": 0, "fill": "none", "scale": 1.0, "count": 1}


def sig(s):
    return (s["shape"], s["color"], int(s.get("rot", 0)) % 360,
            s.get("fill", "none"), round(s.get("scale", 1.0), 2), int(s.get("count", 1)))

# Rotational symmetry (degrees) per shape — used to detect options that LOOK
# the same. A square rotated 90 looks identical; a circle's rotation is moot.
SYM = {"circle": 0, "square": 90, "diamond": 90, "triangle": 120,
       "pentagon": 72, "hexagon": 60, "star": 72, "arrow": 360}


def viz_sig(s):
    """Signature of how a spec actually LOOKS (rotation reduced by symmetry)."""
    shape = s["shape"]
    fold = SYM.get(shape, 360)
    if shape == "circle":
        rot = 0
    elif fold >= 360:
        rot = int(s.get("rot", 0)) % 360
    else:
        rot = int(s.get("rot", 0)) % fold
    return (shape, s["color"], rot, s.get("fill", "none"),
            round(s.get("scale", 1.0), 2), int(s.get("count", 1)))


def render_spec(cx, cy, r, s):
    kind, color = s["shape"], s["color"]
    rot, fill = s.get("rot", 0), s.get("fill", "none")
    scale, count = s.get("scale", 1.0), int(s.get("count", 1))
    rr = r * scale
    if count <= 1:
        return shape(kind, cx, cy, rr, color=color, rotation=rot, fill=fill, sw=4)
    cols = math.ceil(math.sqrt(count))
    rows = math.ceil(count / cols)
    step = (r * 1.8) / max(cols, rows)
    mini = step * 0.42
    out, placed = [], 0
    for ry in range(rows):
        for cc in range(cols):
            if placed >= count:
                break
            px = cx - (cols - 1) * step / 2 + cc * step
            py = cy - (rows - 1) * step / 2 + ry * step
            out.append(shape(kind, px, py, mini, color=color, rotation=rot, fill=fill, sw=3))
            placed += 1
    return "".join(out)


def option_svg(spec):
    """A single answer tile image rendering one spec."""
    return svg_doc(OPT_W, OPT_H, render_spec(OPT_W / 2, OPT_H / 2, 42, spec))


def set_attr(s, attr, val):
    keys = {"count": "count", "shape": "shape", "rot": "rot", "color": "color", "size": "scale"}
    s[keys[attr]] = val


def values_for(attr):
    return {
        "count": [1, 2, 3],
        "rot": [0, 90, 180],
        "size": [0.55, 0.8, 1.1],
        "color": lambda: rng.sample(PAL, 3),
        "shape": lambda: rng.sample(SHAPES, 3),
    }[attr] if attr in ("count", "rot", "size") else (rng.sample(PAL, 3) if attr == "color" else rng.sample(SHAPES, 3))


def shuffle_options(options, answer_index):
    order = list(range(len(options)))
    rng.shuffle(order)
    return [options[i] for i in order], order.index(answer_index)


# ---------------------------------------------------------------------------
# 1) Matrix reasoning (3x3)
# ---------------------------------------------------------------------------

def gen_matrix():
    if rng.random() < 0.45:
        col_attr = "rot"
        row_attr = rng.choice(["count", "color", "size"])
    else:
        col_attr, row_attr = rng.sample(["count", "color", "shape", "size"], 2)
    if rng.random() < 0.5:
        col_attr, row_attr = row_attr, col_attr

    base = base_spec()
    if "rot" in (col_attr, row_attr):
        base["shape"] = "arrow"  # rotation must be unmistakable
    elif "shape" not in (col_attr, row_attr):
        base["shape"] = rng.choice(SHAPES)
    if "color" not in (col_attr, row_attr):
        base["color"] = rng.choice(PAL)

    col_vals, row_vals = values_for(col_attr), values_for(row_attr)
    grid = [[None] * 3 for _ in range(3)]
    for r in range(3):
        for c in range(3):
            s = dict(base)
            set_attr(s, col_attr, col_vals[c])
            set_attr(s, row_attr, row_vals[r])
            grid[r][c] = s
    answer = dict(grid[2][2])

    seen, distract, pool = {viz_sig(answer)}, [], []
    for cv in col_vals[:2]:
        s = dict(answer); set_attr(s, col_attr, cv); pool.append(s)
    for rv in row_vals[:2]:
        s = dict(answer); set_attr(s, row_attr, rv); pool.append(s)
    s = dict(answer); set_attr(s, col_attr, col_vals[0]); set_attr(s, row_attr, row_vals[0]); pool.append(s)
    for s in pool:
        if viz_sig(s) not in seen:
            seen.add(viz_sig(s)); distract.append(s)
    while len(distract) < 3:
        s = dict(answer); set_attr(s, col_attr, rng.choice(col_vals)); set_attr(s, row_attr, rng.choice(row_vals))
        if viz_sig(s) not in seen:
            seen.add(viz_sig(s)); distract.append(s)
    rng.shuffle(distract)
    options = [answer] + distract[:3]
    ordered, correct = shuffle_options(options, 0)

    # puzzle image: 3x3 grid with missing bottom-right cell
    gx, gy, cell = 9, 9, 84
    inner = []
    for r in range(3):
        for c in range(3):
            x, y = gx + c * cell, gy + r * cell
            cx, cy = x + cell / 2, y + cell / 2
            if (r, c) == (2, 2):
                inner.append(qbox(cx, cy, 34))
            else:
                inner.append(rounded_rect(x + 5, y + 5, cell - 10, cell - 10,
                                          fill="#f8f9fd", stroke=BOXLINE, rx=10, sw=1.5))
                inner.append(render_spec(cx, cy, 23, grid[r][c]))
    puzzle = svg_doc(3 * cell + 18, 3 * cell + 18, "".join(inner))

    grid_meta = [[(None if (r, c) == (2, 2) else grid[r][c]) for c in range(3)] for r in range(3)]
    meta = {"kind": "matrix", "colAttr": col_attr, "rowAttr": row_attr,
            "grid": grid_meta, "answer": answer, "options": ordered}
    return {"prompt": "Find the missing piece", "puzzle": puzzle,
            "options": [option_svg(o) for o in ordered], "correct": correct,
            "type": "matrix-reasoning", "category": "pattern", "meta": meta}


# ---------------------------------------------------------------------------
# 2) Visual analogy
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
        sa, sc = rng.sample(ROT_CLEAR, 2)  # only arrow/triangle -> rotation is obvious
        A = dict(base_spec(), shape=sa, color=rng.choice(PAL))
        C = dict(base_spec(), shape=sc, color=rng.choice(PAL))
    elif kind == "fill":
        t = {"kind": "fill"}
        sa, sc = rng.sample(SHAPES, 2)
        A = dict(base_spec(), shape=sa, color=rng.choice(PAL), fill="none")
        C = dict(base_spec(), shape=sc, color=rng.choice(PAL), fill="none")
    elif kind == "color":
        to = rng.choice(PAL)
        t = {"kind": "color", "to": to}
        sa, sc = rng.sample(SHAPES, 2)
        A = dict(base_spec(), shape=sa, color=rng.choice([p for p in PAL if p != to]))
        C = dict(base_spec(), shape=sc, color=rng.choice([p for p in PAL if p != to]))
    else:
        t = {"kind": "size", "factor": rng.choice([0.55, 1.6])}
        sa, sc = rng.sample(SHAPES, 2)
        A = dict(base_spec(), shape=sa, color=rng.choice(PAL))
        C = dict(base_spec(), shape=sc, color=rng.choice(PAL))

    B = apply_transform(A, t)
    answer = apply_transform(C, t)

    seen, pool = {viz_sig(answer)}, [dict(C)]
    others = [p for p in PAL if p != C["color"]]
    if kind == "rot":
        for d in (90, 180, 270):
            pool.append(dict(C, rot=(C.get("rot", 0) + d) % 360))
    elif kind == "fill":
        # distractors differ by COLOR, not rotation, so none look alike
        pool.append(dict(C, color=others[0]))                     # outline, other colour
        pool.append(dict(C, fill=others[1], color=others[1]))      # filled, wrong colour
        pool.append(dict(C, color=others[2]))                     # outline, other colour
    elif kind == "color":
        for col in PAL:
            pool.append(dict(C, color=col))
    else:
        for f in (0.55, 0.8, 1.3, 1.6):
            pool.append(dict(C, scale=round(C.get("scale", 1.0) * f, 2)))
    distract = []
    for s in pool:
        if viz_sig(s) not in seen:
            seen.add(viz_sig(s)); distract.append(s)
    while len(distract) < 3:
        s = dict(C, color=rng.choice(PAL))
        if viz_sig(s) not in seen:
            seen.add(viz_sig(s)); distract.append(s)
    rng.shuffle(distract)
    options = [answer] + distract[:3]
    ordered, correct = shuffle_options(options, 0)

    inner = [
        render_spec(60, 55, 32, A),
        shape("arrow", 180, 55, 26, color=MUTED, sw=4),
        render_spec(300, 55, 32, B),
        render_spec(60, 150, 32, C),
        shape("arrow", 180, 150, 26, color=MUTED, sw=4),
        qbox(300, 150, 32),
    ]
    puzzle = svg_doc(360, 205, "".join(inner))

    meta = {"kind": "analogy", "transform": t, "A": A, "B": B, "C": C,
            "answer": answer, "options": ordered}
    return {"prompt": "A is to B as C is to ?", "puzzle": puzzle,
            "options": [option_svg(o) for o in ordered], "correct": correct,
            "type": "visual-analogy", "category": "analogy", "meta": meta}


# ---------------------------------------------------------------------------
# 3) Odd-one-out  (no puzzle image; the four tiles are the puzzle)
# ---------------------------------------------------------------------------

def gen_odd():
    mode = rng.choice(["shape", "color", "rotation", "fillstate", "size"])
    odd = rng.randint(0, 3)
    base = base_spec()
    base["color"] = rng.choice(PAL)
    base["shape"] = rng.choice(ROT_CLEAR if mode == "rotation" else SHAPES)
    base["rot"] = rng.choice([0, 20]) if mode != "rotation" else rng.choice([0, 15, 30])

    slots = [dict(base) for _ in range(4)]
    if mode == "shape":
        slots[odd]["shape"] = rng.choice([s for s in SHAPES if s != base["shape"]])
    elif mode == "color":
        slots[odd]["color"] = rng.choice([c for c in PAL if c != base["color"]])
    elif mode == "rotation":
        slots[odd]["rot"] = (base["rot"] + 40) % 360
    elif mode == "fillstate":
        slots[odd]["fill"] = base["color"]
    else:
        slots[odd]["scale"] = 0.55 if base.get("scale", 1.0) >= 0.9 else 1.15

    meta = {"kind": "odd", "mode": mode, "odd": odd, "slots": slots}
    return {"prompt": "Which one is the odd one out?", "puzzle": None,
            "options": [option_svg(s) for s in slots], "correct": odd,
            "type": "odd-one-out", "category": "spatial", "meta": meta}


# ---------------------------------------------------------------------------
# 4) Shape progression / series
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
    else:
        seq_vals = [1.2, 1.0, 0.8]
        ans_val = 0.6
        opts = [0.6, 0.8, 1.0, 0.45]
        base["shape"] = rng.choice(["circle", "square", "hexagon", "triangle"])
        to_spec = lambda v: dict(base, scale=round(v, 2))

    uniq = []
    for v in opts:
        if v not in uniq:
            uniq.append(v)
    while len(uniq) < 4:
        uniq.append(uniq[-1] + (1 if mode == "count" else 0.01))
    opt_vals = uniq[:4]
    ordered_vals, correct = shuffle_options(opt_vals, opt_vals.index(ans_val))

    positions = [55, 140, 225]
    inner = [render_spec(positions[i], 60, 28, to_spec(v)) for i, v in enumerate(seq_vals)]
    inner.append(qbox(315, 60, 30))
    puzzle = svg_doc(360, 120, "".join(inner))

    meta = {"kind": "progression", "mode": mode, "seq_vals": seq_vals,
            "answer_val": ans_val, "opt_vals": ordered_vals, "correct": correct}
    return {"prompt": "Which shape completes the pattern?", "puzzle": puzzle,
            "options": [option_svg(to_spec(v)) for v in ordered_vals], "correct": correct,
            "type": "shape-progression", "category": "series", "meta": meta}


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

# Larger pool => two test-takers rarely get the same 20 questions, which kills
# answer-sharing (expected overlap with a 180 pool, 20-question test is ~2).
PLAN = (
    [gen_matrix] * 63 + [gen_analogy] * 45 + [gen_odd] * 36 + [gen_progression] * 36
)


# Farsi translations of the (fixed) English prompts.
PROMPT_FA = {
    "Find the missing piece": "قطعهٔ گمشده را پیدا کنید",
    "A is to B as C is to ?": "A به B مانند C به ؟",
    "Which one is the odd one out?": "کدام‌یک متفاوت است؟",
    "Which shape completes the pattern?": "کدام شکل الگو را کامل می‌کند؟",
}


def main():
    os.makedirs(ASSET_DIR, exist_ok=True)
    for f in os.listdir(ASSET_DIR):
        if f.endswith(".svg"):
            os.remove(os.path.join(ASSET_DIR, f))

    seed = []
    for i, gen in enumerate(PLAN, start=1):
        q = gen()
        qid = f"q{i:03d}"
        has_puzzle = q["puzzle"] is not None
        if has_puzzle:
            with open(os.path.join(ASSET_DIR, f"{qid}_puzzle.svg"), "w") as f:
                f.write(q["puzzle"])
        for j, opt in enumerate(q["options"]):
            with open(os.path.join(ASSET_DIR, f"{qid}_opt{j}.svg"), "w") as f:
                f.write(opt)
        seed.append({
            "ext_id": qid,
            "type": q["type"],
            "category": q["category"],
            "prompt": q["prompt"],
            "prompt_fa": PROMPT_FA.get(q["prompt"], ""),
            "has_puzzle": has_puzzle,
            "correctIndex": q["correct"],
            "meta": q["meta"],
        })

    with open(SEED_DATA, "w") as f:
        json.dump(seed, f, indent=2)

    print(f"Generated {len(seed)} questions -> {ASSET_DIR}")
    print("By type:", dict(Counter(s["type"] for s in seed)))
    print("By category:", dict(Counter(s["category"] for s in seed)))
    print("Answer index distribution:", dict(Counter(s["correctIndex"] for s in seed)))
    print(f"Seed data -> {SEED_DATA}")


if __name__ == "__main__":
    main()

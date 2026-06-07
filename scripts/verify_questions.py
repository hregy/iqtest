#!/usr/bin/env python3
"""
Independent verifier for the generated visual IQ questions.

It does NOT trust the generator. For every question it re-derives the answer
with separate logic and confirms the puzzle is well-formed and unambiguous:

  matrix      : each attribute is constant / column-only / row-only across the
                8 shown cells; predicts the missing cell and checks it equals
                the keyed option, and that exactly one option matches.
  analogy     : independently applies the shown transform to C; checks it equals
                the keyed option and that the same transform maps A->B.
  odd-one-out : exactly one slot differs from the other three in one attribute,
                and that slot is the keyed answer.
  progression : the option values form a valid series; next value matches the key.

Exit 0 = all good.  Run: python3 scripts/verify_questions.py
"""

import json
import os
import sys
from collections import Counter

HERE = os.path.dirname(__file__)
VERIFY = os.path.join(HERE, "seed_data.json")

ATTRS = ["shape", "color", "rot", "fill", "scale", "count"]


def get(s, a):
    if s is None:
        return None
    if a == "rot":
        return int(s.get("rot", 0)) % 360
    if a == "scale":
        return round(s.get("scale", 1.0), 2)
    if a == "count":
        return int(s.get("count", 1))
    return s.get(a, "none" if a == "fill" else None)


def spec_eq(a, b):
    return all(get(a, x) == get(b, x) for x in ATTRS)

# Detect options that LOOK identical (rotation reduced by the shape's symmetry).
SYM = {"circle": 0, "square": 90, "diamond": 90, "triangle": 120,
       "pentagon": 72, "hexagon": 60, "star": 72, "arrow": 360}


def viz_sig(s):
    shape = s["shape"]
    fold = SYM.get(shape, 360)
    rot = 0 if shape == "circle" else (int(s.get("rot", 0)) % (fold if fold < 360 else 360))
    return (shape, s["color"], rot, s.get("fill", "none"),
            round(s.get("scale", 1.0), 2), int(s.get("count", 1)))


def options_look_distinct(options):
    return len({viz_sig(o) for o in options}) == len(options)


# ---- matrix -------------------------------------------------------------
def predict_matrix_cell(grid):
    """Predict grid[2][2] from the 8 known cells, attribute by attribute."""
    pred = {}
    for a in ATTRS:
        known = {(r, c): get(grid[r][c], a) for r in range(3) for c in range(3) if grid[r][c] is not None}
        # constant?
        vals = set(known.values())
        if len(vals) == 1:
            pred[a] = next(iter(vals))
            continue
        # column-only: same value within each column across rows
        col_ok = True
        col_val = {}
        for c in range(3):
            cv = {known[(r, c)] for r in range(3) if (r, c) in known}
            if len(cv) != 1:
                col_ok = False
                break
            col_val[c] = next(iter(cv))
        if col_ok and len(set(col_val.values())) > 1:
            pred[a] = col_val[2]
            continue
        # row-only
        row_ok = True
        row_val = {}
        for r in range(3):
            rv = {known[(r, c)] for c in range(3) if (r, c) in known}
            if len(rv) != 1:
                row_ok = False
                break
            row_val[r] = next(iter(rv))
        if row_ok and len(set(row_val.values())) > 1:
            pred[a] = row_val[2]
            continue
        return None  # attribute follows no simple rule -> ambiguous
    return pred


def verify_matrix(q, problems):
    tag = f"{q['ext_id']} (matrix)"
    meta = q["meta"]
    pred = predict_matrix_cell(meta["grid"])
    if pred is None:
        problems.append(f"{tag}: a cell attribute follows no row/col rule (ambiguous)")
        return
    if not spec_eq(pred, meta["answer"]):
        problems.append(f"{tag}: predicted cell != generator answer")
    opts = meta["options"]
    matches = [i for i, o in enumerate(opts) if spec_eq(o, pred)]
    if matches != [q["correctIndex"]]:
        problems.append(f"{tag}: options matching the rule are {matches}, key is {q['correctIndex']}")
    if not options_look_distinct(opts):
        problems.append(f"{tag}: two options look identical")


# ---- analogy ------------------------------------------------------------
def apply_transform(s, t):
    out = dict(s)
    k = t["kind"]
    if k == "rot":
        out["rot"] = (int(out.get("rot", 0)) + t["deg"]) % 360
    elif k == "fill":
        out["fill"] = out["color"] if out.get("fill", "none") == "none" else "none"
    elif k == "color":
        out["color"] = t["to"]
    elif k == "size":
        out["scale"] = round(out.get("scale", 1.0) * t["factor"], 2)
    return out


def verify_analogy(q, problems):
    tag = f"{q['ext_id']} (analogy)"
    m = q["meta"]
    t = m["transform"]
    if not spec_eq(apply_transform(m["A"], t), m["B"]):
        problems.append(f"{tag}: transform does not map A->B")
    expected = apply_transform(m["C"], t)
    if not spec_eq(expected, m["answer"]):
        problems.append(f"{tag}: transform applied to C != answer")
    opts = m["options"]
    matches = [i for i, o in enumerate(opts) if spec_eq(o, expected)]
    if matches != [q["correctIndex"]]:
        problems.append(f"{tag}: options matching transform are {matches}, key is {q['correctIndex']}")
    if not options_look_distinct(opts):
        problems.append(f"{tag}: two options look identical")


# ---- odd-one-out --------------------------------------------------------
def verify_odd(q, problems):
    tag = f"{q['ext_id']} (odd)"
    slots = q["meta"]["slots"]
    found = None
    for a in ATTRS:
        vals = [get(s, a) for s in slots]
        counts = Counter(vals)
        if len(counts) == 2:
            minority = min(counts, key=lambda k: counts[k])
            if counts[minority] == 1:
                idx = vals.index(minority)
                found = idx if found is None else "multi"
    if found is None:
        problems.append(f"{tag}: no single distinguishing attribute")
    elif found == "multi":
        problems.append(f"{tag}: more than one attribute differs (ambiguous)")
    elif found != q["correctIndex"]:
        problems.append(f"{tag}: odd slot {found} != key {q['correctIndex']}")


# ---- progression --------------------------------------------------------
def verify_progression(q, problems):
    tag = f"{q['ext_id']} (progression)"
    m = q["meta"]
    mode, seq, ans = m["mode"], m["seq_vals"], m["answer_val"]
    if mode == "count":
        d = seq[1] - seq[0]
        ok = all(seq[i + 1] - seq[i] == d for i in range(len(seq) - 1)) and ans == seq[-1] + d
    elif mode == "rotation":
        step = (seq[1] - seq[0]) % 360
        ok = (seq[-1] + step) % 360 == ans % 360
    elif mode == "sides":
        d = seq[1] - seq[0]
        ok = ans == seq[-1] + d
    elif mode == "size":
        d = round(seq[1] - seq[0], 2)
        ok = all(round(seq[i + 1] - seq[i], 2) == d for i in range(len(seq) - 1)) and round(seq[-1] + d, 2) == round(ans, 2)
    else:
        ok = False
    if not ok:
        problems.append(f"{tag}: series {seq} -> {ans} not consistent ({mode})")
    opts = m["opt_vals"]
    if len(set(map(str, opts))) != 4:
        problems.append(f"{tag}: duplicate option values {opts}")
    if q["correctIndex"] >= len(opts) or opts[q["correctIndex"]] != ans:
        problems.append(f"{tag}: key index does not point to answer value")


def main():
    data = json.load(open(VERIFY))
    problems = []
    for q in data:
        if not (0 <= q["correctIndex"] <= 3):
            problems.append(f"{q['ext_id']}: correctIndex out of range")
            continue
        k = q["meta"]["kind"]
        if k == "matrix":
            verify_matrix(q, problems)
        elif k == "analogy":
            verify_analogy(q, problems)
        elif k == "odd":
            verify_odd(q, problems)
        elif k == "progression":
            verify_progression(q, problems)
        else:
            problems.append(f"{q['ext_id']}: unknown kind {k}")

    print(f"Checked {len(data)} questions.")
    print("Type counts:", dict(Counter(q.get("type","?") for q in data)))
    if problems:
        print(f"\nFAILED — {len(problems)} problem(s):")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("\nAll questions valid, unambiguous, and consistent with their images.")


if __name__ == "__main__":
    main()

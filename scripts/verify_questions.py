#!/usr/bin/env python3
"""
Independent verifier for the generated IQ questions.

This does NOT trust the generator. For every question it:
  1. Re-derives the correct answer with a separate solver (different code path).
  2. Confirms that answer is unambiguous (only one simple rule fits).
  3. Confirms options are 4 and distinct, and correctIndex points to the answer.
  4. Cross-checks the rendered SVG against the sidecar for sequence questions
     (the numbers/letters actually drawn match what we verified).

Exit code 0 = all standard & correct. Non-zero = problems printed.

Run: python3 scripts/verify_questions.py
"""

import json
import math
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(__file__)
VERIFY = os.path.join(HERE, "verify_data.json")
IMG_DIR = os.path.join(HERE, "..", "public", "questions")


# ---- Independent sequence solver: returns all plausible next values ----
def solve_numeric(seq):
    n = len(seq)
    diffs = [seq[i + 1] - seq[i] for i in range(n - 1)]
    nexts = {}
    # arithmetic
    if len(set(diffs)) == 1:
        nexts["arithmetic"] = seq[-1] + diffs[0]
    # geometric (integer ratio)
    if all(seq[i] != 0 for i in range(n - 1)) and all(
        seq[i + 1] % seq[i] == 0 for i in range(n - 1)
    ):
        ratios = [seq[i + 1] // seq[i] for i in range(n - 1)]
        if len(set(ratios)) == 1 and ratios[0] != 1:
            nexts["geometric"] = seq[-1] * ratios[0]
    # fibonacci-like
    if n >= 3 and all(seq[i] == seq[i - 1] + seq[i - 2] for i in range(2, n)):
        nexts["fibonacci"] = seq[-1] + seq[-2]
    # consecutive squares
    roots = [math.isqrt(v) for v in seq]
    if (
        all(r * r == v for r, v in zip(roots, seq))
        and all(roots[i + 1] - roots[i] == 1 for i in range(n - 1))
    ):
        nexts["squares"] = (roots[-1] + 1) ** 2
    # alternating two differences (d0,d1,d0,d1,...)
    if n >= 4 and len(set(diffs)) == 2:
        d0, d1 = diffs[0], diffs[1]
        if all(diffs[i] == (d0 if i % 2 == 0 else d1) for i in range(len(diffs))):
            next_diff = d0 if len(diffs) % 2 == 0 else d1
            nexts["alternating"] = seq[-1] + next_diff
    return nexts


def solve_letter(seq_letters):
    idx = [ord(c) - ord("A") for c in seq_letters]
    diffs = [(idx[i + 1] - idx[i]) % 26 for i in range(len(idx) - 1)]
    if len(set(diffs)) == 1:
        return {"arithmetic": chr(ord("A") + (idx[-1] + diffs[0]) % 26)}
    return {}


def check_options(opts):
    problems = []
    if len(opts) != 4:
        problems.append(f"expected 4 options, got {len(opts)}")
    if len(set(map(str, opts))) != len(opts):
        problems.append(f"duplicate options: {opts}")
    return problems


def verify_one(q, problems):
    qid, qtype, ci, meta = q["id"], q["type"], q["correctIndex"], q["meta"]
    tag = f"{qid} ({qtype})"

    if not (0 <= ci <= 3):
        problems.append(f"{tag}: correctIndex {ci} out of range")
        return

    if qtype in ("number-sequence", "letter-sequence"):
        opts = meta["options"]
        problems += [f"{tag}: {p}" for p in check_options(opts)]
        answer = opts[ci]
        if answer != meta["answer"]:
            problems.append(f"{tag}: correctIndex points to {answer}, generator answer is {meta['answer']}")
        nexts = solve_numeric(meta["seq"]) if qtype == "number-sequence" else solve_letter(meta["seq"])
        if not nexts:
            problems.append(f"{tag}: solver found NO rule for {meta['seq']}")
        else:
            vals = set(nexts.values())
            if len(vals) > 1:
                problems.append(f"{tag}: AMBIGUOUS — multiple rules give {nexts} for {meta['seq']}")
            elif answer not in vals:
                problems.append(f"{tag}: solver says next is {vals} but answer is {answer} for {meta['seq']}")

    elif qtype == "odd-one-out":
        slots = meta["slots"]  # (kind, color, rot, fill)
        odd = meta["odd"]
        if odd != ci:
            problems.append(f"{tag}: odd slot {odd} != correctIndex {ci}")
        # exactly one slot must differ from the common signature in its varied dim
        for dim, name in enumerate(["kind", "color", "rot", "fill"]):
            vals = [s[dim] for s in slots]
            counts = Counter(vals)
            if len(counts) == 2:
                minority = min(counts, key=lambda k: counts[k])
                if counts[minority] == 1:
                    odd_slot = vals.index(minority)
                    if odd_slot != ci:
                        problems.append(f"{tag}: {name} differs at slot {odd_slot}, not {ci}")
                    break
        else:
            # no dimension had a clean 3-vs-1 split -> not a valid odd-one-out
            problems.append(f"{tag}: no single distinguishing attribute (slots={slots})")

    elif qtype == "shape-progression":
        opts = meta["options"]
        problems += [f"{tag}: {p}" for p in check_options(opts)]
        answer = opts[ci]
        if answer != meta["answer"]:
            problems.append(f"{tag}: correctIndex points to {answer}, answer is {meta['answer']}")
        seq = meta["seq"]
        mode = meta["mode"]
        if mode == "count":
            d = seq[1] - seq[0]
            if len(set(seq[i + 1] - seq[i] for i in range(len(seq) - 1))) != 1:
                problems.append(f"{tag}: count seq not linear {seq}")
            elif meta["answer"] != seq[-1] + d:
                problems.append(f"{tag}: count next should be {seq[-1]+d}, got {meta['answer']}")
        elif mode == "rotation":
            step = meta["step"]
            expect = (seq[-1] + step) % 360
            if meta["answer"] % 360 != expect:
                problems.append(f"{tag}: rotation next should be {expect}, got {meta['answer']}")
        elif mode == "sides":
            if meta["answer"] != seq[-1] + 1:
                problems.append(f"{tag}: sides next should be {seq[-1]+1}, got {meta['answer']}")
    else:
        problems.append(f"{tag}: unknown type")


# ---- Cross-check: the SVG actually drawn matches the sidecar sequence ----
TEXT_RE = re.compile(r'<text[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*>([^<]+)</text>')


def cross_check_svg(q, problems):
    qtype = q["type"]
    if qtype not in ("number-sequence", "letter-sequence"):
        return
    path = os.path.join(IMG_DIR, f"{q['id']}.svg")
    svg = open(path).read()
    texts = TEXT_RE.findall(svg)
    # sequence terms are the texts on the y=174 row (excluding the '?')
    row = [t[2] for t in texts if abs(float(t[1]) - 174) < 1 and t[2] != "?"]
    seq_str = [str(x) for x in q["meta"]["seq"]]
    if row != seq_str:
        problems.append(f"{q['id']}: drawn sequence {row} != data {seq_str}")
    # Option VALUES sit at each box's vertical center (y=377.5 / 482.5);
    # the A-D labels sit higher (y=348 / 453). Select by position, not text,
    # so option values that happen to be the letters A-D are not dropped.
    opt_texts = [t[2] for t in texts if abs(float(t[1]) - 377.5) < 4 or abs(float(t[1]) - 482.5) < 4]
    data_opts = [str(x) for x in q["meta"]["options"]]
    if sorted(opt_texts) != sorted(data_opts):
        problems.append(f"{q['id']}: drawn options {opt_texts} != data {data_opts}")


def main():
    data = json.load(open(VERIFY))
    problems = []
    for q in data:
        verify_one(q, problems)
        cross_check_svg(q, problems)

    print(f"Checked {len(data)} questions.")
    print("Type counts:", dict(Counter(q["type"] for q in data)))
    if problems:
        print(f"\n❌ {len(problems)} PROBLEM(S):")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("\n✅ All questions valid, unambiguous, and consistent with their images.")


if __name__ == "__main__":
    main()

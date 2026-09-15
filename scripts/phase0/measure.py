#!/usr/bin/env python3
"""Phase 0 — independent measurement of an episode from its by-voice transcript.

  python3 scripts/phase0/measure.py <run dir> <duration seconds>

Reads <run>/heard-by-voice.md (WOMAN = host A, MAN = host B) and <run>/script.json,
prints the conversational stats used in FINDINGS §8 and the count of script lines
heard in the wrong voice. Same maths as the NotebookLM comparison, so the numbers
are comparable.
"""
import json, re, sys

run, dur = sys.argv[1], float(sys.argv[2])
turns = []
for line in open(f"{run}/heard-by-voice.md"):
    m = re.match(r"\[(\d+):(\d+)\]\s*(WOMAN|MAN):\s*(.*)", line.strip())
    if m:
        turns.append((int(m[1]) * 60 + int(m[2]), m[3], m[4]))

W = lambda t: len(re.findall(r"[A-Za-z0-9'’-]+", t))
tot = sum(W(t[2]) for t in turns)
lens = sorted(W(t[2]) for t in turns)
short = sum(1 for n in lens if n <= 5)
b = sum(W(t[2]) for t in turns if t[1] == "MAN")
print(f"turns {len(turns)} · words {tot} · {tot / (dur / 60):.0f} wpm · turns/min {len(turns) / (dur / 60):.1f}")
print(f"median turn {lens[len(lens) // 2]}w · longest {lens[-1]}w · ≤5-word turns {short / len(turns):.0%} · B share {b / tot:.0%}")

# Wrong-voice lines: match each script line's first words into the voice-labelled paragraphs.
L = json.load(open(f"{run}/script.json"))["lines"]
paras = [(t[1], " ".join(re.findall(r"[a-z0-9]+", t[2].lower()))) for t in turns]
key = lambda s, n=5: " ".join(re.findall(r"[a-z0-9]+", s.lower())[:n])
matched = wrong = 0
bad = []
for i, l in enumerate(L):
    k = key(l["text"], min(5, len(l["text"].split())))
    hit = next((p for p in paras if k and k in p[1]), None)
    if not hit:
        continue
    matched += 1
    if hit[0] != ("WOMAN" if l["speaker"] == "A" else "MAN"):
        wrong += 1
        bad.append(f"  {i} {l['speaker']}: {l['text'][:70]}")
print(f"voice: {matched}/{len(L)} lines matched · {wrong} in the wrong voice")
print("\n".join(bad))

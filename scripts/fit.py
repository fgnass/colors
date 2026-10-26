"""Fit the palette model to the measured reference dataset.

The output contains only distribution parameters (quantiles, weights,
probabilities) -- no colors. The generator samples from these.

usage: uv run --with numpy python scripts/fit.py data src/core/params.json
"""
import json, os, sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from oklab import oklch, max_chroma, dh, cusp  # noqa: E402

DATA, OUT = sys.argv[1:3]
NEUTRAL = 0.04
QS = np.linspace(0, 100, 21)


def q(xs):
    xs = np.asarray(xs, float)
    return [round(float(v), 4) for v in np.percentile(xs, QS)] if len(xs) else []


def crel(lch):
    L, C, H = lch
    m = max_chroma(L, H)
    return min(1.0, C / m) if m > 1e-4 else 0.0


pals = json.load(open(os.path.join(DATA, "palettes.json")))
R = [{k: oklch(p[k]) for k in ("main", "light", "dark", "acc1", "acc2")} for p in pals]
isn = lambda c: c[1] < NEUTRAL  # noqa: E731

# --- main -------------------------------------------------------------------
mains = [r["main"] for r in R]
chrom_main = [c for c in mains if not isn(c)]
hist, _ = np.histogram([c[2] for c in chrom_main], bins=24, range=(0, 360))
# light smoothing with neighbours so a single empty bin is not forbidden
sm = (np.roll(hist, 1) + 2 * hist + np.roll(hist, -1)) / 4 + 0.5
# hue depends on lightness (yellows are light, blues dark): weights per lightness tertile
edges = [float(v) for v in np.percentile([c[0] for c in chrom_main], [33.3, 66.7])]
by_l = []
for lo, hi in zip([0, *edges], [*edges, 1.01]):
    h_, _ = np.histogram([c[2] for c in chrom_main if lo <= c[0] < hi], bins=24, range=(0, 360))
    s_ = (np.roll(h_, 1) + 2 * h_ + np.roll(h_, -1)) / 4 + 0.3
    by_l.append([round(float(v / s_.sum()), 4) for v in s_])
main = {
    "neutralP": round(sum(map(isn, mains)) / len(mains), 4),
    "hueWeights": [round(float(v / sm.sum()), 4) for v in sm],
    "hueByL": {"edges": [round(e, 4) for e in edges], "weights": by_l},
    "L": q([c[0] for c in mains]),
    "crel": q([crel(c) for c in chrom_main]),
    "neutralC": q([c[1] for c in mains if isn(c)]),
}

# --- companion --------------------------------------------------------------
comp = [(r["main"], r["acc1"]) for r in R]
companion = {
    "neutralP": round(sum(isn(a) for _, a in comp) / len(comp), 4),
    "dL": q([a[0] - m[0] for m, a in comp]),
    "crel": q([crel(a) for _, a in comp if not isn(a)]),
    "dHue": q([dh(m[2], a[2]) for m, a in comp if not isn(m) and not isn(a)]),
    "neutralC": q([a[1] for _, a in comp if isn(a)]),
}

# --- anchor -----------------------------------------------------------------
def band(mid):
    return "low" if mid < 0.5 else "high" if mid > 0.75 else "mid"


sides = {"light": [], "dark": []}
pdark = {"low": [], "mid": [], "high": []}
for r in R:
    mid = (r["main"][0] + r["acc1"][0]) / 2
    a = r["acc2"]
    side = "light" if a[0] > mid else "dark"
    pdark[band(mid)].append(side == "dark")
    sides[side].append((mid, a, r))
anchor = {"pDark": {k: round(float(np.mean(v)), 4) for k, v in pdark.items()}}
for side, rows in sides.items():
    neu = [a for _, a, _ in rows if isn(a)]
    chrom = [(mid, a) for mid, a, _ in rows if not isn(a)]
    entry = {
        "neutralP": round(len(neu) / len(rows), 4),
        "neutralL": q([a[0] for a in neu]),
        "neutralC": q([a[1] for a in neu]),
        "dist": q([abs(a[0] - mid) for mid, a in chrom]),
        "crel": q([crel(a) for _, a in chrom]),
    }
    if side == "light":
        tinted = [a for a in neu if a[1] > 0.008]
        entry["creamP"] = round(sum(40 <= a[2] <= 110 for a in tinted) / max(len(tinted), 1), 4)
        entry["creamHue"] = q([a[2] for a in tinted if 40 <= a[2] <= 110])
    anchor[side] = entry
anchor["dHue"] = q([dh(r["main"][2], r["acc2"][2]) for r in R if not isn(r["main"]) and not isn(r["acc2"])])

# --- tints (light / dark of main) ------------------------------------------
tints = {
    "lightT": q([(r["light"][0] - r["main"][0]) / max(1 - r["main"][0], 1e-3) for r in R]),
    "darkT": q([(r["main"][0] - r["dark"][0]) / max(r["main"][0], 1e-3) for r in R]),
    "lightC": round(float(np.median([r["light"][1] / r["main"][1] for r in R if not isn(r["main"])])), 4),
    "darkC": round(float(np.median([r["dark"][1] / r["main"][1] for r in R if not isn(r["main"])])), 4),
}

# --- global chroma ceiling --------------------------------------------------
allC = [r[k][1] for r in R for k in r]
chroma_cap = round(float(np.percentile(allC, 99)), 4)

# --- hue families --------------------------------------------------------------
# Named by the English basic color terms (Many Languages, Many Colors, by
# frequency): every single-word term that is clearly colored and at least 20°
# from a more frequent one is a family, at the hue of its typical color.
# Brown and tan drop out as not colored enough.
terms = json.load(open(os.path.join(DATA, "names", "many-languages-en.json")))
families = []
for t in terms[:30]:
    L, C, H = oklch(t["hex"])
    if " " in t["name"] or C < 0.1 or any(abs(dh(H, f["hue"])) < 20 for f in families):
        continue
    families.append({"name": t["name"], "hue": round(H, 1)})
# (the hue drift of the scales is a rule, src/core/families.ts)

# --- near-whites and near-blacks: the no-pure-black/white rule ----------------
neutral_data = json.load(open(os.path.join(DATA, "neutrals.json")))
near = {"white": [oklch(h) for h in neutral_data["nearWhite"]], "black": [oklch(h) for h in neutral_data["nearBlack"]]}
neutrals = {k: {"Lmin": round(min(c[0] for c in cs), 4), "Lmax": round(max(c[0] for c in cs), 4),
                "tintHue": round(float(np.degrees(np.angle(np.mean(np.exp(1j * np.radians([c[2] for c in cs if c[1] > .005])))))) % 360, 1),
                "tintC": round(float(np.median([c[1] for c in cs])), 4)}
            for k, cs in near.items()}

# --- canvases: near-white and near-black alternatives -----------------------
# Sources: near-neutral light/dark colors in the palettes and the sampled
# near-whites / near-blacks. Each canvas tint comes from one of a
# few sources; we keep their probabilities and per-source distributions.
def tint_source(c, main_, comp):
    if c[1] < 0.006:
        return "grey"
    if main_ is not None and main_[1] > .04 and abs(dh(main_[2], c[2])) < 25:
        return "main"
    if comp is not None and comp[1] > .04 and abs(dh(comp[2], c[2])) < 25:
        return "companion"
    if 50 <= c[2] <= 115:
        return "cream"
    if 190 <= c[2] <= 290:
        return "cool"
    return "warm" if c[2] < 50 or c[2] > 330 else "other"


canvas = {}
for kind, test, extra in (("light", lambda c: c[0] >= .9 and c[1] < .05, near["white"]),
                          ("dark", lambda c: c[0] <= .32 and c[1] < .07, near["black"])):
    rows = []
    for r in R:
        for role in ("main", "acc1", "acc2"):
            c = r[role]
            if test(c):
                # a dark/light main is its own tint source
                src = tint_source(c, None if role == "main" else r["main"], None if role == "acc1" else r["acc1"])
                rows.append((c, "main" if role == "main" and src != "grey" else src, r))
    rows += [(tuple(c), tint_source(c, None, None), None) for c in extra]
    entry = {}
    for src in sorted({s for _, s, _ in rows}):
        sub = [(c, r) for c, s, r in rows if s == src]
        e = {"p": round(len(sub) / len(rows), 4), "L": q([c[0] for c, _ in sub]), "C": q([c[1] for c, _ in sub])}
        if src in ("cream", "cool", "warm", "other"):
            e["hue"] = q([c[2] for c, _ in sub])
        entry[src] = e
    canvas[kind] = entry

# --- neon: very light, (almost) gamut-edge chroma -----------------------------
# neon = light, and close to the cusp (the most chromatic point) of its hue,
# so a mid-light yellow-green (olive) does not count
NEON = {"minL": 0.7, "minC": 0.15, "minRel": 0.85, "cuspDL": 0.12}


def is_neon(c):
    cl, _ = cusp(c[2])
    return (c[0] >= NEON["minL"] and c[1] >= NEON["minC"] and crel(c) >= NEON["minRel"]
            and abs(c[0] - cl) <= NEON["cuspDL"])


neon_hits = [(role, r[k]) for r in R for k, role in (("main", "main"), ("acc1", "companion"), ("acc2", "anchor")) if is_neon(r[k])]
nh, _ = np.histogram([c[2] for _, c in neon_hits], bins=12, range=(0, 360))
neon = {
    **NEON,
    "share": round(sum(any(is_neon(r[k]) for k in ("main", "acc1", "acc2")) for r in R) / len(R), 4),
    "roles": {role: round(sum(1 for r_, _ in neon_hits if r_ == role) / len(neon_hits), 4) for role in ("main", "companion", "anchor")},
    "L": q([c[0] for _, c in neon_hits]),
    "crel": q([crel(c) for _, c in neon_hits]),
    # smoothed with a floor, so rare neon hues stay possible
    "hueWeights": [round(float(v), 4) for v in ((np.roll(nh, 1) + 2 * nh + np.roll(nh, -1)) / 4 + 1) / ((np.roll(nh, 1) + 2 * nh + np.roll(nh, -1)) / 4 + 1).sum()],
}

# --- targets for the fidelity test -----------------------------------------
def metrics(R):
    M = np.array([r["main"] for r in R]); A1 = np.array([r["acc1"] for r in R]); A2 = np.array([r["acc2"] for r in R])
    Ls = np.stack([M[:, 0], A1[:, 0], A2[:, 0]], 1); Cs = np.stack([M[:, 1], A1[:, 1], A2[:, 1]], 1)
    return {
        "medLmain": float(np.median(M[:, 0])), "medLacc1": float(np.median(A1[:, 0])), "medLacc2": float(np.median(A2[:, 0])),
        "medCmain": float(np.median(M[:, 1])), "medCacc1": float(np.median(A1[:, 1])), "medCacc2": float(np.median(A2[:, 1])),
        "medAbsDLmainAcc1": float(np.median(np.abs(M[:, 0] - A1[:, 0]))),
        "medAbsDLmainAcc2": float(np.median(np.abs(M[:, 0] - A2[:, 0]))),
        "medLrange": float(np.median(Ls.max(1) - Ls.min(1))),
        "shareVeryLight": float((Ls.max(1) > .9).mean()),
        "shareHasNeutral": float((Cs.min(1) < NEUTRAL).mean()),
        "share2Neutrals": float(((Cs < NEUTRAL).sum(1) >= 2).mean()),
        "corrLmainAcc1": float(np.corrcoef(M[:, 0], A1[:, 0])[0, 1]),
        "corrLacc1Acc2": float(np.corrcoef(A1[:, 0], A2[:, 0])[0, 1]),
        "shareAcc2Extreme": float(np.mean([(a >= max(m, c)) or (a <= min(m, c)) for m, c, a in Ls])),
        "p95C": float(np.percentile(Cs, 95)),
    }


# --- Gaussian copula over lightness and relative chroma of the three roles ---
# marginals: fine quantile tables; dependence: correlation of normal scores
from statistics import NormalDist  # noqa: E402

CQ = np.linspace(0, 100, 41)
VARS = ["main.l", "main.crel", "companion.l", "companion.crel", "anchor.l", "anchor.crel"]
X = np.array([[r[k][0] if v == "l" else crel(r[k]) for k, v in ((role, var) for role, var in (s.split(".") for s in VARS))]
              for r in ({"main": r["main"], "companion": r["acc1"], "anchor": r["acc2"]} for r in R)])
nd = NormalDist()
def avg_ranks(col):
    """ranks 1..n; equal values share their average rank, so the order of the data doesn't matter"""
    order = col.argsort(kind="stable")
    r = np.empty(len(col))
    r[order] = np.arange(1, len(col) + 1)
    for v in np.unique(col):
        tie = col == v
        r[tie] = r[tie].mean()
    return r


ranks = np.column_stack([avg_ranks(X[:, i]) for i in range(X.shape[1])])
Z = np.vectorize(nd.inv_cdf)(ranks / (len(X) + 1))
corr = np.corrcoef(Z, rowvar=False)
copula = {
    "vars": VARS,
    "marginals": [[round(float(v), 4) for v in np.percentile(X[:, i], CQ)] for i in range(len(VARS))],
    "corr": [[round(float(v), 4) for v in row] for row in corr],
}

params = {
    "_comment": "Generated by scripts/fit.py from the palettes and near-neutrals in data/. Distribution parameters only.",
    "neutralC": NEUTRAL, "chromaCap": chroma_cap, "copula": copula,
    "main": main, "companion": companion, "anchor": anchor, "tints": tints,
    "families": families, "neutrals": neutrals, "canvas": canvas, "neon": neon,
    "targets": {k: round(v, 4) for k, v in metrics(R).items()}, "n": len(R),
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(params, open(OUT, "w"), indent=1)
print(json.dumps(params["targets"], indent=1))
print("pDark", anchor["pDark"], "cap", chroma_cap)

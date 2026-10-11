"""Centers. Every center gets a vector built from three kinds of evidence, its nearest peers, a type, and a
list of what its peers run that it never has.

  campus     Jewish student population, school size, public or private, residential or commuter, tuition, country
  behavior   how much it runs, how many sign up, the mix of event types, how often dinners are themed
  programs   the average embedding of everything it has run (what its calendar is "about")

Each block is standardized and weighted equally; peers are the nearest centers by cosine. Types come from
k-means on the same vectors, with k picked by silhouette.
"""
import numpy as np
import pandas as pd
from collections import Counter, defaultdict
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from . import embed
from .common import r, log
from .types import TYPES

GROUPS = {"shabbat": ["shabbat_dinner", "shabbat_lunch", "shabbat_services", "shabbat_other"], "holiday": ["holiday_meal", "holiday_service", "holiday_event"],
          "learning": ["class", "speaker"], "social": ["social", "meal", "cooking", "trip"], "other": ["israel", "chesed", "ritual", "outreach", "other"]}
GROUP_LABEL = {"shabbat": "Shabbat", "holiday": "Holidays", "learning": "Classes", "social": "Social and food", "other": "Everything else"}


def _z(x):
    x = np.asarray(x, float)
    med = np.nanmedian(x) if np.isfinite(x).any() else 0.0
    x = np.where(np.isfinite(x), x, med)
    sd = x.std() or 1.0
    return (x - x.mean()) / sd


def _ay(d):
    return d.year if d.month >= 7 else d.year - 1


def build(centers, events, P, V, ideas, today):
    ev = events[events["ran"]]
    cur_ay = _ay(today)
    rows = []
    Vc = embed.unit(V - V.mean(0))
    for c, row in centers.iterrows():
        g = ev[ev["center"] == c]
        recent = g[g["date"].map(lambda d: (today - d).days <= 730)]
        tm = Counter(g["type"]); n = max(1, len(g))
        sd = g[g["type"] == "shabbat_dinner"]
        sdm = sd[sd["measured"]]
        pc = P[P["center"] == c]
        pv = None
        if len(pc):
            w = np.sqrt(np.maximum(pc["n"].values, 1))[:, None]
            pv = embed.unit((Vc[pc["pid"].values] * w).sum(0))
        yrs = defaultdict(lambda: {"events": 0, "sd": []})
        for d, t, m, regs in zip(g["date"], g["type"], g["measured"], g["regs"]):
            y = _ay(d); yrs[y]["events"] += 1
            if t == "shabbat_dinner" and m:
                yrs[y]["sd"].append(regs)
        rows.append({
            "id": c, "n": len(g), "n_recent": len(recent), "per_year": len(recent) / 2.0,
            "med_regs": float(g.loc[g["measured"], "regs"].median()) if g["measured"].any() else np.nan,
            "sd_regs": float(sdm["regs"].median()) if len(sdm) >= 4 else np.nan,
            "sd_max": int(sdm["regs"].max()) if len(sdm) else 0,
            "mix": {k: sum(tm.get(t, 0) for t in ts) / n for k, ts in GROUPS.items()},
            "types": {t: int(v) for t, v in tm.most_common()},
            "themed": float(((sd["tkeys"].map(len) > 0)).mean()) if len(sd) >= 8 else np.nan,
            "one_time": float((~g["recurring"]).mean()) if len(g) else np.nan,
            "wd": [int((g["wd"] == i).sum()) for i in range(7)],
            "first": g["date"].min() if len(g) else None, "last": g["date"].max() if len(g) else None,
            "pv": pv,
            "traj": [{"ay": f"{y}-{str(y + 1)[2:]}", "events": yrs[y]["events"], "sd": r(float(np.median(yrs[y]["sd"])), 1) if len(yrs[y]["sd"]) >= 3 else None, "sd_n": len(yrs[y]["sd"])} for y in sorted(yrs) if y >= 2020],
            "upcoming": int((events["upcoming"] & (events["center"] == c)).sum()),
        })
    F = pd.DataFrame(rows).set_index("id")
    C = centers.join(F)
    active = C[(C["n"] >= 15) & C["pv"].notna()].copy()
    # ---- blocks
    pop = (active["pop_ug"].fillna(0) + active["pop_grad"].fillna(0)).replace(0, np.nan)
    campus = np.column_stack([
        _z(np.log10(active["jpop"].clip(lower=5))), _z(np.log10(pop)), _z(active["public"].map({True: 1.0, False: 0.0})),
        _z((active["residency"] == "Residential").astype(float)), _z(np.log10(active["tuition"].replace(0, np.nan).clip(lower=1000))),
        _z((active["country"] == "USA").astype(float)), _z(active["prestige"].map(lambda p: 0.0 if p in (None, "Standard") or p != p else 1.0)),
    ])
    behavior = np.column_stack([
        _z(np.log10(active["per_year"].clip(lower=1))), _z(np.log10(active["med_regs"].clip(lower=1))), _z(np.log10(active["sd_regs"].clip(lower=1))),
        _z(active["rsvp_share"]), _z(active["themed"]), _z(active["one_time"]),
        *[_z(active["mix"].map(lambda m, k=k: m[k])) for k in GROUPS],
    ])
    PV = np.stack(active["pv"].values)
    sem = PCA(n_components=min(16, len(active) - 1), random_state=7).fit_transform(PV - PV.mean(0))
    sem = sem / (sem.std() or 1.0)
    def blk(m):
        return m / np.sqrt((m ** 2).sum(1).mean())
    X = np.hstack([blk(campus), blk(behavior), blk(sem)])
    Xn = embed.unit(X)
    S = Xn @ Xn.T
    Sb = {"campus": embed.unit(campus) @ embed.unit(campus).T, "behavior": embed.unit(behavior) @ embed.unit(behavior).T, "programs": embed.unit(sem) @ embed.unit(sem).T}
    ids = list(active.index)
    # ---- types
    best = None
    for k in range(4, 9):
        km = KMeans(n_clusters=k, n_init=20, random_state=7).fit(Xn)
        sc = silhouette_score(Xn, km.labels_)
        if best is None or sc > best[0] + 0.005:
            best = (sc, k, km.labels_)
    sil, k, labels = best
    active["cluster"] = labels
    cl_out = []
    names_used = Counter()
    for cl in range(k):
        g = active[active["cluster"] == cl]
        mr, py, jp = g["sd_regs"].median(), g["per_year"].median(), g["jpop"].median()
        size = "Big dinners" if mr >= 35 else ("Mid-size dinners" if mr >= 15 else "Small dinners")
        vol = "packed calendar" if py >= 140 else ("steady calendar" if py >= 60 else "light calendar")
        mixz = {gk: float(np.mean([m[gk] for m in g["mix"]]) - np.mean([m[gk] for m in active["mix"]])) for gk in GROUPS}
        top = max(mixz, key=mixz.get)
        extra = {"shabbat": "Shabbat at the center", "holiday": "holiday-heavy", "learning": "class-heavy", "social": "lots of social and food", "other": "wide mix"}[top] if mixz[top] >= 0.05 else None
        abroad = float((g["country"] != "USA").mean())
        name = f"{size}, {vol}" + (f", {extra}" if extra else "")
        if abroad >= 0.6:
            name = "Outside the US: " + name[0].lower() + name[1:]
        names_used[name] += 1
        if names_used[name] > 1:
            name += f" ({names_used[name]})"
        cl_out.append({"id": cl, "name": name, "n": int(len(g)), "centers": [int(i) for i in g.sort_values("sd_regs", ascending=False).index],
                       "median_dinner": r(mr, 1), "events_per_year": r(py, 0), "jpop": r(jp, 0), "themed": r(float(g["themed"].median()), 2),
                       "mix": {gk: r(float(np.mean([m[gk] for m in g["mix"]])), 3) for gk in GROUPS}})
    # ---- peers and gaps
    idea_centers = {}
    recent_cut = today.replace(year=today.year - 3)
    for i in ideas:
        cs = set(P.loc[i["programs"], "center"][P.loc[i["programs"], "last"].map(lambda d: d >= recent_cut).values])
        idea_centers[i["id"]] = (cs, set(P.loc[i["programs"], "center"]))
    out = {}
    for a, cid in enumerate(ids):
        order = [b for b in np.argsort(-S[a]) if b != a][:12]
        peers = []
        for b in order:
            why = sorted(((Sb[kk][a, b], kk) for kk in Sb), reverse=True)
            peers.append({"id": int(ids[b]), "sim": r(S[a, b], 3), "why": [kk for s_, kk in why if s_ >= 0.5][:2]})
        pset = {p["id"] for p in peers}
        gaps = []
        for i in ideas:
            recent_c, ever = idea_centers[i["id"]]
            if cid in ever:
                continue
            npeers = len(recent_c & pset)
            if npeers >= 3 and (i["lift"] is None or i["lift"] >= 0.9):
                gaps.append({"idea": i["id"], "peers": npeers, "lift": i["lift"], "centers": i["centers"], "score": npeers * (i["lift"] or 1.0)})
        gaps.sort(key=lambda x: -x["score"])
        row = active.loc[cid]
        out[int(cid)] = {"peers": peers, "gaps": [{k_: v for k_, v in g_.items() if k_ != "score"} for g_ in gaps[:18]], "cluster": int(row["cluster"])}
    # 2-D picture of the centers
    try:
        import umap
        xy = umap.UMAP(n_neighbors=10, min_dist=0.4, metric="cosine", random_state=7).fit_transform(Xn)
        xy = (xy - xy.min(0)) / np.maximum(xy.max(0) - xy.min(0), 1e-9)
    except Exception:
        xy = PCA(2).fit_transform(Xn); xy = (xy - xy.min(0)) / np.maximum(xy.max(0) - xy.min(0), 1e-9)
    for a, cid in enumerate(ids):
        out[int(cid)]["xy"] = [r(xy[a, 0], 4), r(xy[a, 1], 4)]
    stats = {}
    for cid, row in C.iterrows():
        stats[int(cid)] = {
            "n": int(row["n"]) if row["n"] == row["n"] else 0, "per_year": r(row["per_year"], 0), "med_regs": r(row["med_regs"], 1), "sd_regs": r(row["sd_regs"], 1), "sd_max": int(row["sd_max"]) if row["sd_max"] == row["sd_max"] else 0,
            "rsvp_share": r(row["rsvp_share"], 2), "reliable": bool(row["reliable"]), "themed": r(row["themed"], 2), "one_time": r(row["one_time"], 2),
            "mix": {k_: r(v, 3) for k_, v in row["mix"].items()} if isinstance(row["mix"], dict) else None, "types": row["types"] if isinstance(row["types"], dict) else {},
            "wd": row["wd"] if isinstance(row["wd"], list) else None, "traj": row["traj"] if isinstance(row["traj"], list) else [],
            "first": row["first"].isoformat() if row["first"] is not None and row["first"] == row["first"] else None,
            "last": row["last"].isoformat() if row["last"] is not None and row["last"] == row["last"] else None, "upcoming": int(row["upcoming"]) if row["upcoming"] == row["upcoming"] else 0,
        }
    centers["cluster"] = centers.index.map(lambda c: out.get(int(c), {}).get("cluster"))
    log("centers: profiled", len(ids), "| types", k, "(silhouette", round(float(sil), 3), ")")
    return {"profiles": out, "stats": stats, "clusters": cl_out, "silhouette": r(sil, 3), "k": int(k), "group_labels": GROUP_LABEL, "profiled": len(ids)}, centers

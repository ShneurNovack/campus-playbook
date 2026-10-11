"""Centers. What each center is, which centers are like it, and what those centers run that it does not.

  categories  seven named facets per center, each decided by a written rule (see categories.py)
  peers       "centers like this one", scored in two halves:
                match      same kind of campus (0.4), a similar number of Jewish students (0.3), a similar biggest
                           draw (0.3). Similar means within a factor of four, closer counting for more.
                style      how alike the two calendars are: events a year, use of sign-ups, the mix of event
                           families, themed dinners, and the average embedding of everything each has run
              A center with too few events to read is matched on its campus alone.
  gaps        ideas several peers run that the center has nothing close to
  profiles    for every answer of every facet: who is in it, what is typical there, which ideas are far more
              common there than elsewhere, and which ideas beat normal there
  validation  how much each facet explains of things it was not built from, against shuffled labels
"""
import numpy as np
import pandas as pd
from collections import Counter, defaultdict
from sklearn.decomposition import PCA
from . import embed, categories as cat
from .common import r, log
from .types import TYPES, EVENT_TYPES

GROUPS = {"shabbat": ["shabbat_dinner", "shabbat_lunch", "shabbat_services", "shabbat_other"], "holiday": ["holiday_meal", "holiday_service", "holiday_event"],
          "learning": ["class", "speaker"], "social": ["social", "meal", "cooking", "trip"], "other": ["israel", "chesed", "ritual", "outreach", "other"]}
GROUP_LABEL = {"shabbat": "Shabbat", "holiday": "Holidays", "learning": "Classes", "social": "Social and food", "other": "Everything else"}
GAP_NEAR = 0.60     # a program this close to an idea's center of mass counts as already running it
MIN_EVENTS = 15     # fewer events than this and the center is read from its campus alone
SETTING_WEIGHT = 1.6
# partial credit between settings that are not the same but not far apart
RELATED = {("flagship", "regional"): 0.5, ("selective", "private"): 0.5, ("private", "small"): 0.4, ("selective", "small"): 0.4, ("regional", "small"): 0.3,
           ("regional", "commuter"): 0.3, ("flagship", "commuter"): 0.2, ("canada", "flagship"): 0.4, ("canada", "regional"): 0.3, ("canada", "abroad"): 0.3,
           ("private", "regional"): 0.3, ("private", "flagship"): 0.2, ("selective", "flagship"): 0.2}
OUTCOMES = {"reach": "Biggest draw", "volume": "Events a year", "signups": "Share of events with sign-ups", "themed": "Share of dinners with a theme",
            "shabbat": "Shabbat share of the calendar", "holiday": "Holiday share", "learning": "Learning share", "social": "Social and food share",
            "content": "What the events are about"}
SKIP = {"reach": ("reach",), "volume": ("volume",), "signups": ("signups",), "emphasis": ("shabbat", "holiday", "learning", "social")}


def _z(x):
    x = np.asarray(x, float)
    med = np.nanmedian(x) if np.isfinite(x).any() else 0.0
    x = np.where(np.isfinite(x), x, med)
    sd = x.std() or 1.0
    return (x - x.mean()) / sd


def _ay(d):
    return d.year if d.month >= 7 else d.year - 1


def _setting_match(a, b):
    return 1.0 if a == b else RELATED.get((a, b), RELATED.get((b, a), 0.0))


def _close(x, y):
    """1 when two sizes are equal, 0 when they are a factor of four or more apart, 0.5 when either is unknown."""
    if x is None or y is None or x != x or y != y or x <= 0 or y <= 0:
        return 0.5
    return float(max(0.0, 1.0 - abs(np.log2(x / y)) / 2.0))


def _blk(m):
    return m / np.sqrt((m ** 2).sum(1).mean())


def _measure(centers, events, P, Vc, today):
    """One row of plain measurements per center."""
    ev = events[events["ran"]]
    rows = []
    for c, row in centers.iterrows():
        g_all = ev[ev["center"] == c]
        g = g_all[g_all["type"].isin(EVENT_TYPES)]
        age = g["date"].map(lambda d: (today - d).days) if len(g) else pd.Series([], dtype=float)
        g3, g2 = g[age <= 1095], g[age <= 730]
        first, last = (g["date"].min(), g["date"].max()) if len(g) else (None, None)
        span = min(2.0, max(0.5, (today - first).days / 365.0)) if first is not None else 2.0
        m3 = g3[g3["regs"] > 0]
        top = np.sort(m3["regs"].values)[::-1]
        sd, sd3 = g[g["type"] == "shabbat_dinner"], g3[g3["type"] == "shabbat_dinner"]
        sdm3 = sd3[sd3["regs"] > 0]
        sdm = sd[sd["regs"] > 0]
        routine = len(sdm3) >= 8 and len(sdm3) / max(1, len(sd3)) >= 0.6
        base = g3 if len(g3) >= 30 else g
        tm, tm_all = Counter(base["type"]), Counter(g_all["type"])
        pc = P[P["center"] == c]
        pv = None
        if len(pc):
            w = np.sqrt(np.maximum(pc["n"].values, 1))[:, None]
            pv = embed.unit((Vc[pc["pid"].values] * w).sum(0))
        yrs = defaultdict(lambda: {"events": 0, "sd": []})
        for d, t, regs in zip(g["date"], g["type"], g["regs"]):
            y = _ay(d); yrs[y]["events"] += 1
            if t == "shabbat_dinner" and regs > 0:
                yrs[y]["sd"].append(regs)
        up = events[events["upcoming"] & (events["center"] == c)]
        rows.append({
            "id": c, "n": len(g), "n_all": len(g_all), "n3": len(g3), "per_year": len(g2) / span, "measured3": len(m3), "share3": len(m3) / max(1, len(g3)),
            "top5": float(top[:5].mean()) if len(top) >= 5 else np.nan, "biggest": int(top[0]) if len(top) else 0,
            "med_regs": float(g.loc[g["regs"] > 0, "regs"].median()) if (g["regs"] > 0).any() else np.nan,
            "sd_regs": float(sdm3["regs"].median()) if routine else np.nan, "sd_max": int(sdm["regs"].max()) if len(sdm) else 0,
            "mix": {k: sum(tm.get(t, 0) for t in ts) / max(1, len(base)) for k, ts in GROUPS.items()},
            "types": {t: int(v) for t, v in tm_all.most_common()},
            "themed": float((sd["tkeys"].map(len) > 0).mean()) if len(sd) >= 8 else np.nan,
            "one_time": float((~g["recurring"]).mean()) if len(g) else np.nan,
            "wd": [int((g["wd"] == i).sum()) for i in range(7)],
            "first": first, "last": max([last] + list(up["date"])) if last is not None and len(up) else last,
            "n_now": int((age <= 365).sum()) if len(g) else 0, "n_before": int(((age > 365) & (age <= 730)).sum()) if len(g) else 0,
            "pv": pv, "upcoming": int(len(up)),
            "traj": [{"ay": f"{y}-{str(y + 1)[2:]}", "events": yrs[y]["events"], "sd": r(float(np.median(yrs[y]["sd"])), 1) if len(yrs[y]["sd"]) >= 3 else None, "sd_n": len(yrs[y]["sd"])} for y in sorted(yrs) if y >= 2020],
        })
    return pd.DataFrame(rows).set_index("id")


def _categorize(C, today):
    cats, facts = {}, {}
    for c, row in C.iterrows():
        s, f = cat.setting(row)
        js = row["jpop_served"]
        tot = np.nansum([row["pop_ug"], row["pop_grad"]])
        f.update({"jewish": int(js) if js == js and js else None, "campuses": int(row["n_campuses"]) if row["n_campuses"] == row["n_campuses"] else 1,
                  # only where the count and the enrollment describe the same campus
                  "jewish_share": r(row["jpop"] / tot, 3) if row["jpop"] == row["jpop"] and tot > 0 and js == js and js and row["jpop"] >= 0.8 * js else None,
                  "served": [x["name"] for x in row["served"]][:12] if isinstance(row["served"], list) else []})
        cats[c] = {
            "setting": s, "jewish": cat.jewish(js),
            "reach": cat.reach(row["top5"], row["measured3"], row["share3"]),
            "volume": cat.volume(row["per_year"], row["n"]),
            "emphasis": cat.emphasis(row["mix"], row["n3"] if row["n3"] >= 30 else row["n"]),
            "signups": cat.signups(row["share3"], row["n"]),
            "stage": cat.stage(row["first"], row["last"], row["n_now"], row["n_before"], today),
        }
        facts[c] = f
    return cats, facts


def _campus_block(C, cats, facts):
    keys = [k for k, _, _ in cat.FACETS[0]["values"]]
    onehot = np.array([[SETTING_WEIGHT if cats[c]["setting"] == k else 0.0 for k in keys] for c in C.index])
    enroll = np.array([(facts[c].get("undergrads") or 0) + (facts[c].get("grads") or 0) or np.nan for c in C.index], float)
    adm = np.array([facts[c].get("adm_rate") if facts[c].get("adm_rate") is not None else np.nan for c in C.index], float)
    wf = np.array([facts[c].get("with_family") if facts[c].get("with_family") is not None else np.nan for c in C.index], float)
    js = C["jpop_served"].astype(float).values
    num = np.column_stack([_z(np.log10(np.clip(js, 5, None))), _z(np.log10(enroll)), _z(adm), _z(wf), _z(np.log10(np.clip(js / enroll, 1e-4, None)))])
    return np.hstack([onehot, num])


def _value_profiles(C, cats, ideas, P, events, profiled):
    """For every answer of every facet: who, what is typical, and which ideas set it apart."""
    prof = set(profiled)
    ever = {i["id"]: set(P.loc[i["programs"], "center"]) & prof for i in ideas}
    idea_of = P.set_index("pid")["idea"]
    sc = events[events["scored"] & events["adj"].notna()][["center", "pid", "adj"]].copy()
    sc["idea"] = sc["pid"].map(idea_of)
    sc = sc[sc["idea"] >= 0]
    sc["lg"] = np.clip(np.log(sc["adj"]), -1.5, 1.5)
    out = []
    for f in cat.FACETS:
        vals = []
        for key, label, definition in f["values"]:
            members = [c for c in C.index if cats[c][f["key"]] == key]
            mp = [c for c in members if c in prof]
            g = C.loc[mp]
            ms = set(mp)
            entry = {"key": key, "label": label, "def": definition, "n": len(members), "n_profiled": len(mp),
                     "centers": [int(c) for c in sorted(members, key=lambda c: -(C.at[c, "top5"] if C.at[c, "top5"] == C.at[c, "top5"] else -1))],
                     "stats": {"jewish": r(g["jpop_served"].astype(float).median(), 0) if len(g) else None, "reach": r(g["top5"].median(), 0) if len(g) else None,
                               "volume": r(g["per_year"].median(), 0) if len(g) else None, "dinner": r(g["sd_regs"].median(), 0) if len(g) else None,
                               "themed": r(g["themed"].median(), 2) if len(g) else None, "signups": r(g["share3"].median(), 2) if len(g) else None},
                     "mix": {gk: r(float(np.mean([m[gk] for m in g["mix"]])), 3) for gk in GROUPS} if len(g) else None, "ideas": [], "works": []}
            if key != "unknown" and len(mp) >= 5:
                n_in, n_out = len(mp), len(prof) - len(mp)
                dist = []
                for i in ideas:
                    if i.get("staple"):
                        continue
                    k_in = len(ever[i["id"]] & ms); k_out = len(ever[i["id"]]) - k_in
                    if k_in >= 3 and k_in / n_in >= 0.25 and k_in / n_in - k_out / max(1, n_out) >= 0.15:
                        dist.append({"idea": i["id"], "in": k_in, "share": r(k_in / n_in, 2), "elsewhere": r(k_out / max(1, n_out), 2)})
                entry["ideas"] = sorted(dist, key=lambda x: -(x["share"] - x["elsewhere"]))[:8]
                if f["key"] in ("setting", "jewish", "reach"):
                    sub = sc[sc["center"].isin(ms)]
                    works = []
                    for iid, gg in sub.groupby("idea"):
                        idea = ideas[int(iid)]
                        if idea.get("staple") or len(gg) < 8 or gg["center"].nunique() < 4:
                            continue
                        lift = float(np.exp(gg["lg"].sum() / (len(gg) + 4.0)))
                        if lift >= 1.12:
                            works.append({"idea": int(iid), "lift": r(lift, 2), "n": int(len(gg)), "centers": int(gg["center"].nunique()), "overall": idea["lift"]})
                    entry["works"] = sorted(works, key=lambda x: -x["lift"])[:6]
            vals.append(entry)
        out.append({"key": f["key"], "label": f["label"], "question": f["question"], "kind": f["kind"], "basis": f["basis"], "values": [v for v in vals if v["n"] > 0]})
    return out


def build(centers, events, P, V, ideas, today):
    Vc = embed.unit(V - V.mean(0))
    C = centers.join(_measure(centers, events, P, Vc, today))
    cats, facts = _categorize(C, today)
    active = C[(C["n"] >= MIN_EVENTS) & C["pv"].notna()].copy()
    ids = list(active.index)
    pos = {c: i for i, c in enumerate(C.index)}
    campus_all = _campus_block(C, cats, facts)
    campus = campus_all[[pos[c] for c in ids]]
    behavior = np.column_stack([
        _z(np.log10(active["per_year"].clip(lower=1))), _z(np.log10(active["top5"].clip(lower=1))), _z(active["share3"]), _z(active["themed"]), _z(active["one_time"]),
        *[_z(active["mix"].map(lambda m, k=k: m[k])) for k in GROUPS],
    ])
    PV = np.stack(active["pv"].values)
    sem_raw = PCA(n_components=min(16, len(active) - 1), random_state=7).fit_transform(PV - PV.mean(0))
    sem = sem_raw / (sem_raw.std() or 1.0)
    Xn = embed.unit(np.hstack([_blk(campus), _blk(behavior), _blk(sem)]))      # used for the 2-D picture
    style = embed.unit(np.hstack([_blk(behavior), _blk(sem)]))
    St = style @ style.T
    cu = embed.unit(campus)
    Sb = {"calendar": embed.unit(behavior) @ embed.unit(behavior).T, "programs": embed.unit(sem) @ embed.unit(sem).T}
    js = {c: (float(C.at[c, "jpop_served"]) if C.at[c, "jpop_served"] == C.at[c, "jpop_served"] else None) for c in C.index}
    draw = {c: (float(C.at[c, "top5"]) if cats[c]["reach"] != "unknown" else None) for c in C.index}

    def match(x, y):
        return 0.4 * _setting_match(cats[x]["setting"], cats[y]["setting"]) + 0.3 * _close(js[x], js[y]) + 0.3 * _close(draw[x], draw[y])

    def why(x, y, a=None, b=None):
        out_ = []
        if cats[x]["setting"] == cats[y]["setting"]:
            out_.append("setting")
        if js[x] and js[y] and _close(js[x], js[y]) >= 0.5:
            out_.append("jewish")
        if draw[x] and draw[y] and _close(draw[x], draw[y]) >= 0.5:
            out_.append("reach")
        if a is not None:
            out_ += [kk for kk in Sb if Sb[kk][a, b] >= 0.5]
        return out_

    # ---- which centers already run something close to each idea
    idea_centers = {}
    recent_cut = today.replace(year=today.year - 3)
    for i in ideas:
        cs = set(P.loc[i["programs"], "center"][P.loc[i["programs"], "last"].map(lambda d: d >= recent_cut).values])
        idea_centers[i["id"]] = (cs, set(P.loc[i["programs"], "center"]))
    from .ideas import _canon
    cent = embed.unit(np.stack([Vc[i["programs"]].mean(0) for i in ideas]))
    icanon = [set(_canon(i["label"].lower()).split()) for i in ideas]
    pcanon = [set(_canon(n).split()) for n in P["nname"]]
    near = {}
    for cid_, g_ in P.groupby("center"):
        ix_ = g_.index.values
        mx = (Vc[ix_] @ cent.T).max(0)
        words = [pcanon[j] for j in ix_]
        near[cid_] = (mx >= GAP_NEAR) | np.array([bool(ic) and any(ic <= w for w in words) for ic in icanon])
    setting_members = defaultdict(set)
    for c in ids:
        setting_members[cats[c]["setting"]].add(c)

    def gaps_for(cid, pset):
        gaps = []
        mine = setting_members[cats[cid]["setting"]] - {cid}
        for i in ideas:
            recent_c, ever = idea_centers[i["id"]]
            if cid in ever or (cid in near and near[cid][i["id"]]):
                continue
            npeers = len(recent_c & pset)
            if npeers >= 3 and (i["lift"] is None or i["lift"] >= 0.9):
                gaps.append({"idea": i["id"], "peers": npeers, "lift": i["lift"], "centers": i["centers"],
                             "setting_share": r(len(recent_c & mine) / len(mine), 2) if len(mine) >= 5 else None, "score": npeers * (i["lift"] or 1.0)})
        gaps.sort(key=lambda x: -x["score"])
        return [{k_: v for k_, v in g_.items() if k_ != "score"} for g_ in gaps[:18]]

    out = {}
    for a, cid in enumerate(ids):
        score = np.array([0.55 * match(cid, o) + 0.45 * max(0.0, float(St[a, b])) for b, o in enumerate(ids)])
        score[a] = -1
        peers = [{"id": int(ids[b]), "sim": r(score[b], 3), "why": why(cid, ids[b], a, b), "same_setting": cats[cid]["setting"] == cats[ids[b]]["setting"]} for b in np.argsort(-score)[:12]]
        out[int(cid)] = {"cat": cats[cid], "facts": facts[cid], "basis": "all", "peers": peers, "gaps": gaps_for(cid, {p["id"] for p in peers})}
    # centers with too few events: peers by campus alone
    cu_all = embed.unit(campus_all)
    for cid in C.index:
        if cid in out:
            continue
        sims = np.array([0.7 * (0.57 * _setting_match(cats[cid]["setting"], cats[o]["setting"]) + 0.43 * _close(js[cid], js[o])) for o in ids]) + 0.3 * np.clip(cu_all[pos[cid]] @ cu.T, 0, 1)
        order = list(np.argsort(-sims)[:12])
        peers = [{"id": int(ids[b]), "sim": r(sims[b], 3), "why": why(cid, ids[b]), "same_setting": cats[cid]["setting"] == cats[ids[b]]["setting"]} for b in order]
        out[int(cid)] = {"cat": cats[cid], "facts": facts[cid], "basis": "campus", "peers": peers, "gaps": gaps_for(cid, {p["id"] for p in peers})}

    # ---- 2-D picture of the profiled centers
    try:
        import umap
        xy = umap.UMAP(n_neighbors=10, min_dist=0.4, metric="cosine", random_state=7).fit_transform(Xn)
    except Exception:
        xy = PCA(2).fit_transform(Xn)
    xy = (xy - xy.min(0)) / np.maximum(xy.max(0) - xy.min(0), 1e-9)
    for a, cid in enumerate(ids):
        out[int(cid)]["xy"] = [r(xy[a, 0], 4), r(xy[a, 1], 4)]

    # ---- does each facet explain anything it was not built from?
    outcomes = {"reach": np.log10(active["top5"].clip(lower=1)).values, "volume": np.log10(active["per_year"].clip(lower=1)).values, "signups": active["share3"].values,
                "themed": active["themed"].values, **{k: active["mix"].map(lambda m, k=k: m[k]).values for k in ("shabbat", "holiday", "learning", "social")},
                **{f"content_{j + 1}": sem_raw[:, j] for j in range(4)}}
    labels = {f["key"]: [cats[c][f["key"]] for c in ids] for f in cat.FACETS}
    val = cat.validate(labels, outcomes, SKIP)
    for f, res in val.items():
        cs = [res.pop(k) for k in list(res) if k.startswith("content_")]
        if cs:
            res["content"] = {"eta2": r(np.mean([x["eta2"] for x in cs]), 3), "n": cs[0]["n"], "chance": r(np.mean([x["chance"] for x in cs]), 3), "p": r(float(np.median([x["p"] for x in cs])), 4)}
    # how often a center's nearest peers share its setting, against what the sizes of the settings would give by chance
    same = np.mean([np.mean([p["same_setting"] for p in out[int(c)]["peers"][:5]]) for c in ids])
    sizes = Counter(cats[c]["setting"] for c in ids)
    chance = sum(v * (v - 1) for v in sizes.values()) / (len(ids) * (len(ids) - 1))

    stats = {}
    for cid, row in C.iterrows():
        nn = lambda v: v if v == v else None
        stats[int(cid)] = {
            "n": int(row["n_all"]), "events": int(row["n"]), "per_year": r(row["per_year"], 0) if row["n"] >= MIN_EVENTS else None, "med_regs": r(row["med_regs"], 1),
            "sd_regs": r(row["sd_regs"], 1), "sd_max": int(row["sd_max"]), "top5": r(row["top5"], 0), "biggest": int(row["biggest"]),
            "rsvp_share": r(row["share3"], 2) if row["n3"] >= 10 else r(row["rsvp_share"], 2), "reliable": bool(row["reliable"]), "themed": r(row["themed"], 2), "one_time": r(row["one_time"], 2),
            "mix": {k_: r(v, 3) for k_, v in row["mix"].items()} if row["n"] else None, "types": row["types"],
            "wd": row["wd"], "traj": row["traj"], "first": row["first"].isoformat() if row["first"] is not None else None,
            "last": row["last"].isoformat() if row["last"] is not None else None, "upcoming": int(row["upcoming"]),
            "n_now": int(row["n_now"]), "n_before": int(row["n_before"]),
        }
    for k in [f["key"] for f in cat.FACETS]:
        centers[k] = centers.index.map(lambda c, k=k: cats[c][k])
    blob = {
        "profiled": len(ids), "total": int(len(C)), "min_events": MIN_EVENTS, "profiles": out, "stats": stats,
        "facets": _value_profiles(C, cats, ideas, P, events, ids), "group_labels": GROUP_LABEL,
        "validation": val, "outcome_labels": OUTCOMES,
        "peer_check": {"same_setting_top5": r(float(same), 3), "by_chance": r(float(chance), 3)},
        "reference": {"matched": int(sum(1 for c in C.index if facts[c]["source"].startswith("IPEDS"))), "us": int((C["country"] == "USA").sum()),
                      "source": "IPEDS HD2023, IPEDS SFA2223, College Scorecard (May 2025)"},
    }
    log("centers: profiled", len(ids), "| settings", dict(Counter(cats[c]["setting"] for c in C.index)), "| peers sharing a setting", round(float(same), 2), "vs chance", round(float(chance), 2))
    return blob, centers

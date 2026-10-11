"""Write everything the app reads: the catalog of programs, the search vectors, the page payloads. Also runs
the engine's checks on itself (how good the search projection is, how well neighbors predict results)."""
import os, json, time, datetime as dt
import urllib.request
import numpy as np
from collections import Counter
from scipy.stats import spearmanr
from sklearn.decomposition import PCA
from . import embed
from .common import OUT, IMG_PREFIX, dump, log, r
from .types import TYPES, EVENT_TYPES

EPOCH = dt.date(2020, 1, 1)
K = 256


def day(d):
    return (d - EPOCH).days


def img_short(s):
    return s if not isinstance(s, str) else s


def project(V):
    """PCA to K dimensions for the in-browser search. Returns the int8 matrix, the projection file, and recall."""
    mean = V.mean(0)
    Vc = V - mean
    pca = PCA(n_components=K, random_state=7).fit(Vc)
    X = Vc @ pca.components_.T
    Xn = embed.unit(X)
    q8 = np.clip(np.round(Xn / np.abs(Xn).max(1, keepdims=True) * 127), -127, 127).astype(np.int8)
    # recall of the small int8 search against exact cosine on the full vectors
    rng = np.random.default_rng(11); qs = rng.choice(len(V), size=min(400, len(V)), replace=False)
    full = embed.unit(Vc)
    exact = np.argsort(-(full[qs] @ full.T), axis=1)[:, 1:11]
    Q = q8.astype(np.float32); Qn = Q / np.linalg.norm(Q, axis=1, keepdims=True)
    approx = np.argsort(-(Xn[qs] @ Qn.T), axis=1)[:, 1:11]
    recall = float(np.mean([len(set(a) & set(b)) / 10 for a, b in zip(exact, approx)]))
    proj = np.concatenate([[1024, K], mean.astype(np.float32), pca.components_.astype(np.float32).ravel()]).astype(np.float32)
    return q8, proj, Xn, {"dims": K, "recall_at_10": r(recall, 3), "variance_kept": r(float(pca.explained_variance_ratio_.sum()), 3)}


def thresholds(P, Xn):
    """What cosine means here: pairs of programs inside the same idea (different centers) against random pairs."""
    rng = np.random.default_rng(5)
    same = []
    for i, g in P[P["idea"] >= 0].groupby("idea"):
        ids = g["pid"].values
        if len(ids) < 2:
            continue
        for _ in range(min(6, len(ids))):
            a, b = rng.choice(ids, 2, replace=False)
            if P.at[a, "center"] != P.at[b, "center"]:
                same.append(float(Xn[a] @ Xn[b]))
    a = rng.integers(0, len(P), 20000); b = rng.integers(0, len(P), 20000)
    rand = np.einsum("ij,ij->i", Xn[a], Xn[b])
    return {"same_p10": r(np.percentile(same, 10), 3), "same_p50": r(np.percentile(same, 50), 3), "random_p50": r(np.percentile(rand, 50), 3),
            "random_p95": r(np.percentile(rand, 95), 3), "random_p99": r(np.percentile(rand, 99), 3)}


def predictor_check(P, Xn, cen_sim=None):
    """Can the programs nearest to an idea tell how it will do? Checked on programs the model has not seen:
    each of the newest fifth of scored programs is predicted from older programs at other centers."""
    S = P[(P["n_scored"] >= 1) & P["adj"].notna() & P["type"].isin(EVENT_TYPES)].sort_values("first")
    if len(S) < 500:
        return None
    cut = int(len(S) * 0.8)
    tr, te = S.iloc[:cut], S.iloc[cut:]
    y_tr = np.clip(np.log(tr["adj"].values), -1.5, 1.5); y_te = np.clip(np.log(te["adj"].values), -1.5, 1.5)
    sims = Xn[te["pid"].values] @ Xn[tr["pid"].values].T
    same_center = te["center"].values[:, None] == tr["center"].values[None, :]
    sims = np.where(same_center, -1, sims)
    out = {}
    for k, pw in [(20, 4), (40, 8), (80, 8)]:
        idx = np.argpartition(-sims, k, axis=1)[:, :k]
        w = np.maximum(np.take_along_axis(sims, idx, 1), 0) ** pw
        pred = (w * y_tr[idx]).sum(1) / np.maximum(w.sum(1), 1e-9)
        out[f"k{k}_p{pw}"] = r(spearmanr(pred, y_te).correlation, 3)
    tmean = tr.groupby("type")["adj"].agg(lambda x: float(np.mean(np.clip(np.log(x), -1.5, 1.5)))).to_dict()
    base = np.array([tmean.get(t, 0.0) for t in te["type"]])
    out["type_only"] = r(spearmanr(base, y_te).correlation, 3)
    idx = np.argpartition(-sims, 40, axis=1)[:, :40]
    w = np.maximum(np.take_along_axis(sims, idx, 1), 0) ** 8
    pred = (w * y_tr[idx]).sum(1) / np.maximum(w.sum(1), 1e-9)
    order = np.argsort(pred); fifth = len(order) // 5
    hit = (y_te >= np.log(1.2))
    out["top_fifth_hit"] = r(float(hit[order[-fifth:]].mean()), 3); out["bottom_fifth_hit"] = r(float(hit[order[:fifth]].mean()), 3); out["base_hit"] = r(float(hit.mean()), 3)
    out["tested"] = int(len(te)); out["trained"] = int(len(tr))
    return out


def _bare(name, desc, short):
    """A program posted with a name and nothing else. Search treats these with care (see src/lib/search.js)."""
    nm, d, s = (name or "").strip().lower(), (desc or "").strip().lower(), (short or "").strip().lower()
    return (len(d) < 25 or d == nm) and (len(s) < 25 or s == nm)


def catalog(P, events, centers, ideas, theme_ids, q8):
    cidx = {c: i for i, c in enumerate(centers.index)}
    tkeys = list(TYPES)
    ev = events[events["ran"] | events["upcoming"]].sort_values("dt")
    occ = {}
    for pid, g in ev[~events.loc[ev.index, "canceled"]].groupby("pid"):
        occ[int(pid)] = [[day(d), int(rg) if not up else -1, int(round(a * 100)) if (a == a and sc_) else 0] for d, rg, a, up, sc_ in zip(g["date"], g["regs"], g["adj"], g["upcoming"], g["scored"])]
    cs = []
    for c, row in centers.iterrows():
        short = row["nick"] if isinstance(row["nick"], str) and row["nick"] else (row["campus"] or row["name"])
        cs.append({"id": int(c), "name": row["name"], "short": short, "campus": row["campus"], "city": row["city"], "state": row["state"], "country": row["country"],
                   "region": row["region"], "jpop": int(row["jpop_served"]) if row.get("jpop_served") == row.get("jpop_served") and row.get("jpop_served") else None,
                   "pop": int(np.nansum([row["pop_ug"], row["pop_grad"]])) if np.nansum([row["pop_ug"], row["pop_grad"]]) > 0 else None,
                   "logo": row["logo"], "img": row["building"], "slug": row["slug"], "site": row["website"], "lat": r(row["lat"], 3), "lon": r(row["lon"], 3),
                   "cat": {k: row[k] for k in ("setting", "jewish", "reach", "volume", "emphasis", "signups", "stage") if k in row and isinstance(row[k], str)},
                   "reliable": bool(row["reliable"]), "public": row["public"] if row["public"] == row["public"] else None, "residency": row["residency"]})
    cols = {
        "key": list(P["key"]), "c": [cidx[c] for c in P["center"]], "name": list(P["name"]), "t": [tkeys.index(t) for t in P["type"]],
        "hol": [h if isinstance(h, str) else None for h in P["hol"]], "aud": [a or None for a in P["aud"]],
        "n": [int(x) for x in P["n"]], "up": [int(x) for x in P["n_up"]], "first": [day(d) for d in P["first"]], "last": [day(d) for d in P["last"]],
        "reg": [r(x, 1) for x in P["med_regs"]], "mx": [int(x) for x in P["max_regs"]], "adj": [int(round(x * 100)) if x == x and x is not None else None for x in P["adj"]],
        "ns": [int(x) for x in P["n_scored"]], "img": [x if isinstance(x, str) else None for x in P["img"]], "idea": [int(x) for x in P["idea"]],
        "th": [[theme_ids.get(k, k) for k in ks] or None for ks in P["themes"]], "wd": [int(x) for x in P["wd"]], "hr": [int(x) for x in P["hour"]],
        "fl": [(1 if a else 0) + (2 if b else 0) + (4 if c_ else 0) + (8 if _bare(nm, d_, s_) else 0)
               for a, b, c_, nm, d_, s_ in zip(P["collab"], P["offsite"], P["recurring"], P["name"], P["desc"], P["short"])],
    }
    core = {"epoch": EPOCH.isoformat(), "img_prefix": IMG_PREFIX, "types": TYPES, "type_keys": tkeys, "event_types": EVENT_TYPES, "centers": cs, "programs": cols, "dims": int(q8.shape[1]), "count": int(len(P))}
    text = {"desc": [d[:700] for d in P["desc"]], "short": [s[:200] for s in P["short"]], "occ": [occ.get(int(p), []) for p in P["pid"]]}
    return core, text


def write_all(state):
    P, V, events, centers = state["P"], state["V"], state["events"], state["centers"]
    q8, proj, Xn, search_info = project(V)
    q8.tofile(f"{OUT}/vectors.bin"); proj.tofile(f"{OUT}/proj.bin")
    theme_ids = {t["key"]: t["id"] for t in state["theme_blob"]["themes"]}
    core, text = catalog(P, events, centers, state["ideas"], theme_ids, q8)
    sizes = {}
    sizes["catalog.json"] = dump(core, f"{OUT}/catalog.json")
    sizes["text.json"] = dump(text, f"{OUT}/text.json")
    for name in ("themes", "ideas", "timing", "home", "coming", "niches", "centers"):
        sizes[f"{name}.json"] = dump(state["centers_blob"] if name == "centers" else state[name], f"{OUT}/{name}.json")
    thr = thresholds(P, Xn)
    pred = predictor_check(P, Xn)
    ev = events
    engine = {
        "generated": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z", "pulled_at": state["pulled_at"].isoformat() + "Z", "today": state["today"].isoformat(),
        "counts": {"events": int(len(ev)), "ran": int(ev["ran"].sum()), "upcoming": int(ev["upcoming"].sum()), "canceled": int(ev["canceled"].sum()), "centers": int(len(centers)),
                   "measured": int(ev["measured"].sum()), "scored": int(ev["scored"].sum()), "zero_signups": int((ev["ran"] & (ev["regs"] == 0)).sum()),
                   "signups": int(ev.loc[ev["ran"], "regs"].sum()), "programs": int(len(P)), "ideas": int(len(state["ideas"])), "themes": int(len(state["theme_blob"]["themes"])),
                   "texts": int(state["T"].shape[0]), "with_flyer": int(ev["img"].notna().sum()), "reliable_centers": int(centers["reliable"].sum()),
                   "first_event": ev["date"].min().isoformat(), "by_year": {int(y): int(n) for y, n in Counter(d.year for d in ev.loc[ev["ran"], "date"]).items()}},
        "types": {"labels": TYPES, "events": {t: int(n) for t, n in Counter(ev.loc[~ev["canceled"], "type"]).most_common()},
                  "by_rules": int((ev["type_src"] == "rules").sum()), "by_neighbors": int((ev["type_src"] == "nearest").sum()), "unplaced": int((ev["type_src"] == "none").sum()), **state["type_info"]},
        "terms": state["term_info"], "score": state["score_info"], "search": {**search_info, **thr}, "predictor": pred, "sizes": sizes,
        "model": "@cf/baai/bge-m3", "llm_calls": 0,
    }
    dump(engine, f"{OUT}/engine.json")
    log("export:", {k: f"{v // 1024} KB" for k, v in sizes.items()}, "| vectors", q8.shape, "| search", search_info, "| thresholds", thr)
    log("predictor check:", pred)
    return engine


def push(names=None):
    """Upload the output folder to the Worker's bucket."""
    edge = os.environ.get("EDGE_URL", "https://campus-playbook.shneur.workers.dev")
    for name in sorted(os.listdir(OUT)):
        hdr = embed._headers()
        if names and name not in names:
            continue
        path = f"{OUT}/{name}"
        ct = "application/json; charset=utf-8" if name.endswith(".json") else "application/octet-stream"
        data = open(path, "rb").read()
        for attempt in range(4):
            try:
                req = urllib.request.Request(f"{edge}/analyst/put?key=public/{name}", data=data, method="PUT", headers={**hdr, "content-type": ct})
                with urllib.request.urlopen(req, timeout=180) as resp:
                    json.load(resp)
                break
            except Exception as e:
                if attempt == 3:
                    raise
                time.sleep(3 + 3 * attempt)
        log("pushed", name, len(data) // 1024, "KB")

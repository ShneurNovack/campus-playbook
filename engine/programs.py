"""Programs. An occurrence is one date; a program is everything one center has run under one name
("Sushi in the Sukkah" at Texas A&M, three years running). Programs are what gets embedded, clustered and searched."""
import numpy as np
import pandas as pd
from collections import Counter
from .common import log, sha, r
from . import embed


def attach_text(events, cache):
    texts = [embed.event_text(n, s, d) for n, s, d in zip(events["name"], events["short"], events["desc"])]
    uniq = sorted(set(texts)); pos = {t: i for i, t in enumerate(uniq)}
    T = embed.unit(cache.get(uniq))
    events["tix"] = [pos[t] for t in texts]
    return events, T, uniq


def knn_types(events, T, k=15, min_sim=0.60):
    """Type the events the rules could not place, from the labelled texts nearest to them. Also returns how well
    the same vote reproduces the rules on a held-out sample of rule-typed texts."""
    by_text = events.groupby("tix")["type"].agg(lambda x: Counter(x).most_common(1)[0][0])
    lab = by_text[~by_text.isin(["other"])]
    unl = by_text[by_text == "other"]
    L = T[lab.index.values]; lt = lab.values
    def vote(Q, exclude=None):
        S = Q @ L.T
        if exclude is not None:
            S[np.arange(len(Q)), exclude] = -1
        top = np.argpartition(-S, k, axis=1)[:, :k]
        out = []
        for i in range(len(Q)):
            idx = top[i][np.argsort(-S[i, top[i]])]
            sims = S[i, idx]
            w = Counter()
            for j, s in zip(idx, sims):
                w[lt[j]] += max(s, 0) ** 4
            best, bw = w.most_common(1)[0]
            out.append((best, float(sims[0]), bw / sum(w.values())))
        return out
    # held-out check
    rng = np.random.default_rng(7); sample = rng.choice(len(L), size=min(2000, len(L)), replace=False)
    chk = vote(L[sample], exclude=sample)
    conf = [(p, s, sh) for p, s, sh in chk]
    ok = [p == lt[i] for (p, s, sh), i in zip(chk, sample) if s >= min_sim and sh >= 0.5]
    acc = float(np.mean(ok)) if ok else None
    cover = len(ok) / len(sample)
    res = vote(T[unl.index.values]) if len(unl) else []
    new = {tix: p for tix, (p, s, sh) in zip(unl.index.values, res) if s >= min_sim and sh >= 0.5}
    m = events["tix"].map(new)
    n_fix = int(m.notna().sum())
    events["type_src"] = np.where(m.notna(), "nearest", np.where(events["type"] == "other", "none", "rules"))
    events.loc[m.notna(), "type"] = m[m.notna()]
    log("types: nearest-neighbor placed", n_fix, "events; held-out agreement with the rules", round(acc, 3) if acc else None, "on", round(cover, 2), "of sample")
    return events, {"placed_events": n_fix, "heldout_agreement": r(acc, 3), "heldout_coverage": r(cover, 3), "still_other": int((events["type"] == "other").sum())}


def build(events, T):
    live = events[~events["canceled"]]
    rows, vecs = [], []
    ev_prog = {}
    for (c, nn), g in live.groupby(["center", "nname"], sort=True):
        ran = g[g["ran"]]
        sc = ran[ran["scored"]]
        meas = ran[ran["measured"]]
        names = Counter(g["name"]); name = names.most_common(1)[0][0]
        descs = Counter(d for d in g["desc"] if d)
        desc = max(descs, key=lambda d: (descs[d], len(d))) if descs else ""
        shorts = Counter(s for s in g["short"] if s)
        img = next((x for x in g.sort_values("dt", ascending=False)["img"] if isinstance(x, str)), None)
        tix = Counter(g["tix"])
        v = np.zeros(T.shape[1], np.float32)
        for t, n in tix.items():
            v += T[t] * np.sqrt(n)
        last = g.sort_values("dt").iloc[-1]
        pid = len(rows)
        for i in g["id"]:
            ev_prog[i] = pid
        themes = Counter(k for ks in g["tkeys"] for k in ks) if "tkeys" in g else Counter()
        rows.append({
            "pid": pid, "key": sha(f"{c}|{nn}")[:10], "center": int(c), "nname": nn, "name": name, "desc": desc, "short": shorts.most_common(1)[0][0] if shorts else "",
            "img": img, "type": Counter(g["type"]).most_common(1)[0][0], "hol": next(iter(Counter(h for h in g["hol"] if isinstance(h, str)).most_common(1)), (None,))[0],
            "aud": sorted({a for l in g["aud"] for a in l}), "collab": bool(g["collab"].any()), "offsite": float(g["offsite"].mean()) >= 0.5,
            "themes": [k for k, _ in themes.most_common(3)], "one_off": bool(g["one_off"].any()) if "one_off" in g else False,
            "n": int(len(ran)), "n_up": int(g["upcoming"].sum()), "n_meas": int(len(meas)), "n_scored": int(len(sc)),
            "first": ran["date"].min() if len(ran) else g["date"].min(), "last": ran["date"].max() if len(ran) else g["date"].max(),
            "years": sorted({d.year for d in ran["date"]}), "recurring": float(g["recurring"].mean()) >= 0.5,
            "med_regs": float(meas["regs"].median()) if len(meas) else None, "max_regs": int(meas["regs"].max()) if len(meas) else 0,
            "adj": float(np.exp(np.mean(np.clip(np.log(sc["adj"]), -1.5, 1.5)))) if len(sc) else None,
            "pct": float(sc["pct"].mean()) if len(sc) and sc["pct"].notna().any() else None,
            "wd": int(Counter(g["wd"]).most_common(1)[0][0]), "hour": int(Counter(g["hour"]).most_common(1)[0][0]),
            "setting": int(last["setting"]), "dropped": bool(last["setting_state"] == "Canceled"),
        })
        vecs.append(v)
    P = pd.DataFrame(rows)
    V = embed.unit(np.stack(vecs))
    events["pid"] = events["id"].map(ev_prog)
    log("programs", len(P), "| with flyer", int(P["img"].notna().sum()), "| ran at least once", int((P["n"] > 0).sum()))
    return P, V, events

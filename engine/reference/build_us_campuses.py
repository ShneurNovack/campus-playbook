"""One-time builder for engine/reference/us_campuses.json.

The Chabad on Campus API describes each campus with fields its staff typed in (public or private, commuter or
residential, "prestige"). Those are uneven: several large residential state universities are marked commuter.
For US campuses this script replaces them with federal data:

  IPEDS Institutional Characteristics (HD2023, nces.ed.gov)   control, locale, Carnegie basic class,
                                                                Carnegie size and setting
  College Scorecard, most recent institution file               admission rate, undergraduate and graduate enrollment
  IPEDS Student Financial Aid (SFA2223)                         where first-year students live: on campus, with family,
                                                                or off campus on their own

Each center's primary campus is matched to one institution by name inside the same state, and the match must sit
within 40 km of the center. Matches are written to a small JSON file that is committed, so the daily engine run
needs no download. MANUAL holds the few campuses the name match cannot settle.

  python -m engine.reference.build_us_campuses HD2023.csv Most-Recent-Cohorts-Institution.csv sfa2223.csv
"""
import json, math, os, re, sys
import pandas as pd
from difflib import SequenceMatcher
from .. import prepare

HERE = os.path.dirname(os.path.abspath(__file__))
STATES = {"alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
          "district of columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
          "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
          "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
          "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
          "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
          "wisconsin": "WI", "wyoming": "WY"}
# campus_id -> IPEDS UNITID, for names the matcher cannot settle (filled in after reading the review list)
MANUAL = {1334: 194310, 369: 166656, 85: 174066, 320: 214777, 463: 214777, 930: 195474, 872: 221759}
DROP = {"university", "of", "the", "at", "and", "campus", "main", "in", "for", "a", "undergrads", "undergrad", "grad", "grads", "graduate"}


def toks(s):
    s = re.sub(r"[^a-z0-9 ]", " ", (s or "").lower().replace("&", " and ").replace("st.", "saint").replace("suny", "suny "))
    return [w for w in s.split() if w not in DROP]


def sim(a, b):
    ta, tb = set(toks(a)), set(toks(b))
    if not ta or not tb:
        return 0.0
    jac = len(ta & tb) / len(ta | tb)
    return 0.6 * jac + 0.4 * SequenceMatcher(None, " ".join(toks(a)), " ".join(toks(b))).ratio()


def km(a, b, c, d):
    p = math.pi / 180
    x = 0.5 - math.cos((c - a) * p) / 2 + math.cos(a * p) * math.cos(c * p) * (1 - math.cos((d - b) * p)) / 2
    return 12742 * math.asin(math.sqrt(x))


def main(hd_path, sc_path, sfa_path, review=False):
    hd = pd.read_csv(hd_path, encoding="latin-1", low_memory=False)
    hd.columns = [c.replace("ï»¿", "") for c in hd.columns]
    sc = pd.read_csv(sc_path, low_memory=False, usecols=["UNITID", "ADM_RATE", "UGDS", "GRADS"])
    # where first-year students live (IPEDS Student Financial Aid): on campus, off campus with family, off campus on
    # their own. Public institutions report it for in-state students, private ones for federal-aid recipients.
    sfa = pd.read_csv(sfa_path, encoding="latin-1", low_memory=False)
    sfa.columns = [c.replace("ï»¿", "") for c in sfa.columns]
    live = {}
    for _, x in sfa.iterrows():
        for pre in ("GIST", "GIS4"):
            on, wf, of = x.get(pre + "ON2"), x.get(pre + "WF2"), x.get(pre + "OF2")
            tot = sum(v for v in (on, wf, of) if v == v)
            if tot and tot >= 30:
                live[int(x["UNITID"])] = (round((on if on == on else 0) / tot, 3), round((wf if wf == wf else 0) / tot, 3))
                break
    hd = hd[(hd["ICLEVEL"] == 1) | (hd["C21SZSET"] == 18) | hd["UNITID"].isin(MANUAL.values())].merge(sc, on="UNITID", how="left")
    centers = prepare.build_centers()
    out, rows = {}, []
    for cid, c in centers[centers["country"] == "USA"].iterrows():
        if c["campus_id"] != c["campus_id"] or c["campus_id"] is None:
            continue
        camp = int(c["campus_id"])
        st = STATES.get((c["state"] or "").strip().lower(), (c["state"] or "").strip().upper())
        cand = hd[(hd["STABBR"] == st) & (hd["SECTOR"] != 0)]
        if c["lat"] == c["lat"] and c["lat"]:
            near = cand[[km(c["lat"], c["lon"], la, lo) <= 20 for la, lo in zip(cand["LATITUDE"], cand["LONGITUD"])]]
            cand = near if len(near) else cand
        best = None
        if camp in MANUAL:
            best = (1.0, hd[hd["UNITID"] == MANUAL[camp]].iloc[0])
        else:
            for _, h in cand.iterrows():
                s = max(sim(c["campus"], h["INSTNM"]), max((sim(c["campus"], a) for a in str(h["IALIAS"]).split("|") if len(a) > 3), default=0) * 0.95)
                if best is None or s > best[0]:
                    best = (s, h)
        if best is None:
            rows.append((cid, camp, c["campus"], st, None, None, None)); continue
        s, h = best
        d = km(c["lat"], c["lon"], h["LATITUDE"], h["LONGITUD"]) if c["lat"] == c["lat"] and c["lat"] else None
        ok = camp in MANUAL or (s >= 0.6 and (d is None or d <= 20))
        rows.append((cid, camp, c["campus"], st, h["INSTNM"], round(s, 2), None if d is None else round(d, 1), ok))
        if ok:
            num = lambda v: None if v != v else float(v)
            out[str(camp)] = {"unitid": int(h["UNITID"]), "name": h["INSTNM"], "control": int(h["CONTROL"]), "locale": int(h["LOCALE"]), "basic": int(h["C21BASIC"]),
                              "sizeset": int(h["C21SZSET"]), "adm_rate": num(h["ADM_RATE"]), "ugds": num(h["UGDS"]), "grads": num(h["GRADS"]), "medical": int(h["MEDICAL"]) == 1,
                              "on_campus": live.get(int(h["UNITID"]), (None, None))[0], "with_family": live.get(int(h["UNITID"]), (None, None))[1]}
    if review:
        for r_ in sorted(rows, key=lambda r_: (r_[-1] is True, r_[5] or 0)):
            print(r_)
    json.dump({"source": "IPEDS HD2023 and College Scorecard (May 2025)", "campuses": out}, open(f"{HERE}/us_campuses.json", "w"), indent=0, sort_keys=True)
    print("matched", len(out), "of", len(rows))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], review=len(sys.argv) > 4)

"""Center categories.

A center is described on seven separate questions (facets). Each has a few named answers with a written rule,
so anyone can check why a center landed where it did. Two facets describe the campus and need no event history;
five describe what the center does and are read from its events.

  setting    what kind of campus it is             federal data for US campuses (engine/reference), country otherwise
  jewish     how many Jewish students it serves    the counts each center's staff entered, summed over its campuses
  reach      how many it draws at its biggest      the average sign-ups of its five biggest events in three years
  volume     how full its calendar is              events a year over the last two years
  emphasis   what the calendar leans toward        the share of Shabbat, holiday, learning and social events
  signups    how it uses the sign-up system        the share of events that took any sign-ups
  stage      where it is in its life               first event, last event, and this year against last

Nothing here is a statistical cluster. The earlier version grouped centers with k-means on one blended vector;
the groups overlapped almost completely (silhouette 0.10) and their names did not mean anything. Rules on
separate questions do: `validate` measures how much each facet explains of things it was not built from.
"""
import json, os, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_REF = None


def reference():
    global _REF
    if _REF is None:
        try:
            _REF = {int(k): v for k, v in json.load(open(f"{HERE}/reference/us_campuses.json"))["campuses"].items()}
        except Exception:
            _REF = {}
    return _REF


COMMUTER_SHARE = 0.40     # first-year students living with family
SELECTIVE_RATE = 0.25     # admission rate
SMALL_UNDERGRADS = 5000
LARGE_UNDERGRADS = 20000
CARNEGIE = {15: "Doctoral, very high research (R1)", 16: "Doctoral, high research (R2)", 17: "Doctoral or professional", 18: "Master's, larger", 19: "Master's, medium",
            20: "Master's, smaller", 21: "Baccalaureate, arts and sciences", 22: "Baccalaureate, diverse fields", 23: "Baccalaureate and associate's", 24: "Faith-related",
            25: "Medical school", 26: "Health professions", 27: "Research institution", 28: "Engineering and technology", 29: "Business school",
            30: "Arts, music and design", 31: "Law school", 32: "Other special focus"}

FACETS = [
    {"key": "setting", "label": "Campus setting", "question": "What kind of campus is it?", "kind": "campus",
     "basis": "US campuses are placed with federal data: IPEDS (public or private, Carnegie class, where first-year students live) and the College Scorecard (admission rate, enrollment). Campuses elsewhere are placed by country.",
     "values": [
         ("flagship", "Major public university", "Public and residential, with 20,000 or more undergraduates or in the top Carnegie research class (R1)."),
         ("regional", "Mid-size public university", "Public and residential, 5,000 to 19,999 undergraduates, and outside the R1 research class."),
         ("commuter", "Commuter campus", "Four in ten or more first-year students live with family, or the campus is classed as non-residential."),
         ("selective", "Selective private university", "Private research university that admits a quarter of applicants or fewer."),
         ("private", "Private university", "Private, 5,000 or more undergraduates, and not in the selective group."),
         ("small", "Small college", "Fewer than 5,000 undergraduates, public or private. Mostly liberal arts colleges."),
         ("grad", "Graduate or professional school", "A medical, law or graduate campus, or a center that serves graduate students only."),
         ("canada", "Canadian university", "Any campus in Canada."),
         ("abroad", "UK, Europe and beyond", "Any campus outside the US and Canada."),
     ]},
    {"key": "jewish", "label": "Jewish student population", "question": "How many Jewish students does it serve?", "kind": "campus",
     "basis": "The Jewish undergraduate and graduate counts each center's staff entered in the Chabad on Campus directory, added up over every campus the center serves. These are estimates.",
     "values": [
         ("j1", "Under 300", "Fewer than 300 Jewish students."),
         ("j2", "300 to 999", "300 to 999 Jewish students."),
         ("j3", "1,000 to 2,499", "1,000 to 2,499 Jewish students."),
         ("j4", "2,500 or more", "2,500 Jewish students or more."),
         ("unknown", "Not listed", "No usable count in the directory."),
     ]},
    {"key": "reach", "label": "Biggest draw", "question": "How many does it draw when it goes big?", "kind": "events",
     "basis": "The average sign-ups of the center's five biggest events in the last three years. A typical week says little here, because many centers do not ask for sign-ups at an ordinary dinner. The big events are where nearly everyone does.",
     "values": [
         ("r1", "Under 25", "Its five biggest events averaged fewer than 25 sign-ups."),
         ("r2", "25 to 59", "Its five biggest events averaged 25 to 59 sign-ups."),
         ("r3", "60 to 149", "Its five biggest events averaged 60 to 149 sign-ups."),
         ("r4", "150 or more", "Its five biggest events averaged 150 sign-ups or more."),
         ("unknown", "Sign-ups too rare to tell", "Fewer than 15 events with sign-ups in three years, or under 15% of events took any."),
     ]},
    {"key": "volume", "label": "Calendar", "question": "How full is its calendar?", "kind": "events",
     "basis": "Events a year over the last two years, as posted on the sign-up system. Standing forms and to-go offers are not counted.",
     "values": [
         ("v1", "Under 45 events a year", "Less than one event a week."),
         ("v2", "45 to 99 a year", "One or two events a week during the semester."),
         ("v3", "100 to 179 a year", "Three to five events a week during the semester."),
         ("v4", "180 or more a year", "Something almost every day of the semester."),
         ("unknown", "Too few events to tell", "Fewer than 15 events on the system."),
     ]},
    {"key": "emphasis", "label": "Calendar emphasis", "question": "What does its calendar lean toward?", "kind": "events",
     "basis": "The share of the last three years' events in each family. A center gets a label when one family takes a clearly larger share of its calendar than it does at most centers (roughly the top fifth).",
     "values": [
         ("shabbat", "Mostly Shabbat", "Six in ten or more of its posted events are Shabbat meals and services."),
         ("learning", "Learning-heavy", "Three in ten or more are classes, learning programs or speakers."),
         ("social", "Social and food heavy", "27% or more are socials, food events, baking or trips."),
         ("holiday", "Holiday-driven", "27% or more are holiday meals, services and events."),
         ("balanced", "Balanced mix", "No family dominates."),
         ("unknown", "Too few events to tell", "Fewer than 30 events in three years."),
     ]},
    {"key": "signups", "label": "Use of sign-ups", "question": "How does it use the sign-up system?", "kind": "events",
     "basis": "The share of the last three years' events that took at least one sign-up. This decides how much of the center's calendar can be scored at all.",
     "values": [
         ("s4", "Nearly everything", "80% or more of its events took sign-ups."),
         ("s3", "Most events", "50% to 79% took sign-ups."),
         ("s2", "Some events", "15% to 49% took sign-ups."),
         ("s1", "Rarely", "Under 15% took sign-ups. The system is used as a calendar."),
         ("unknown", "Too few events to tell", "Fewer than 15 events on the system."),
     ]},
    {"key": "stage", "label": "Stage on the system", "question": "Where is it in its life on the sign-up system?", "kind": "events",
     "basis": "First and latest event, and the last twelve months of events against the twelve before.",
     "values": [
         ("new", "New to the system", "Its first event on the sign-up system was in the last 18 months. The center itself may be much older."),
         ("growing", "Growing", "At least 30% more events in the last twelve months than the twelve before."),
         ("steady", "Steady", "About as many events as the year before."),
         ("slowing", "Slowing", "At least 30% fewer events than the year before."),
         ("quiet", "Quiet on the system", "Nothing held or posted on the sign-up system in the last six months."),
     ]},
]
LABEL = {f["key"]: {k: lab for k, lab, _ in f["values"]} for f in FACETS}


def setting(row):
    """The campus setting, and the facts it was decided on."""
    ref = reference().get(int(row["campus_id"])) if row.get("campus_id") == row.get("campus_id") and row.get("campus_id") is not None else None
    country = row["country"]
    name = (row["campus"] or "").lower()
    levels = row["levels"] if isinstance(row["levels"], list) else []
    pop_ug = row["pop_ug"] if row["pop_ug"] == row["pop_ug"] else None
    facts = {"source": "IPEDS and College Scorecard" if ref and country == "USA" else "Chabad on Campus directory"}
    if ref and country == "USA":
        facts.update({"institution": ref["name"], "public": ref["control"] == 1, "carnegie": CARNEGIE.get(ref["basic"]), "undergrads": ref["ugds"], "grads": ref["grads"],
                      "adm_rate": ref["adm_rate"], "with_family": ref["with_family"], "on_campus": ref["on_campus"]})
    else:
        # the directory's public-or-private flag is unreliable outside the US (McGill is marked private), so it is left out
        facts.update({"institution": row["campus"], "public": (bool(row["public"]) if row["public"] == row["public"] and row["public"] is not None else None) if country == "USA" else None,
                      "undergrads": pop_ug, "grads": row["pop_grad"] if row["pop_grad"] == row["pop_grad"] else None})
    if country not in ("USA", "Canada"):
        return "abroad", facts
    if country == "Canada":
        return "canada", facts
    grad_name = bool(re.search(r"\b(grads?|graduate|law|medical|medicine)\b", name))
    if (ref and ref["sizeset"] == 18) or grad_name or (not ref and levels == ["Grad"] and not pop_ug):
        # the federal record describes the whole university; its undergraduate facts do not describe a graduate center
        for k in ("undergrads", "adm_rate", "with_family", "on_campus"):
            facts.pop(k, None)
        return "grad", facts
    if not ref:
        if row["residency"] == "Commuter":
            return "commuter", facts
        if pop_ug and pop_ug < SMALL_UNDERGRADS:
            return "small", facts
        return ("regional" if row["public"] is True else "private"), facts
    public, ug, wf = ref["control"] == 1, ref["ugds"] or pop_ug, ref["with_family"]
    if (wf is not None and wf >= COMMUTER_SHARE) or (wf is None and ref["sizeset"] in (6, 9, 12, 15)):
        return "commuter", facts
    if not public and ref["adm_rate"] is not None and ref["adm_rate"] <= SELECTIVE_RATE and ref["basic"] in (15, 16):
        return "selective", facts
    if ug and ug < SMALL_UNDERGRADS:
        return "small", facts
    if not public:
        return "private", facts
    return ("flagship" if ref["basic"] == 15 or (ug and ug >= LARGE_UNDERGRADS) else "regional"), facts


def jewish(n):
    if n is None or n != n or n <= 0:
        return "unknown"
    return "j1" if n < 300 else "j2" if n < 1000 else "j3" if n < 2500 else "j4"


def reach(top5, measured, share):
    if top5 is None or top5 != top5 or measured < 15 or share < 0.15:
        return "unknown"
    return "r1" if top5 < 25 else "r2" if top5 < 60 else "r3" if top5 < 150 else "r4"


def volume(per_year, n):
    if n < 15:
        return "unknown"
    return "v1" if per_year < 45 else "v2" if per_year < 100 else "v3" if per_year < 180 else "v4"


EMPH = {"shabbat": 0.60, "learning": 0.30, "social": 0.27, "holiday": 0.27}


def emphasis(mix, n):
    if n < 30 or not mix:
        return "unknown"
    over = {k: mix.get(k, 0) / t for k, t in EMPH.items() if mix.get(k, 0) >= t}
    return max(over, key=over.get) if over else "balanced"


def signups(share, n):
    if n < 15:
        return "unknown"
    return "s4" if share >= 0.8 else "s3" if share >= 0.5 else "s2" if share >= 0.15 else "s1"


def stage(first, last, n_now, n_before, today):
    if first is None or last is None:
        return "quiet"
    if (today - last).days > 183:
        return "quiet"
    if (today - first).days <= 548:
        return "new"
    if n_before >= 20:
        ratio = n_now / n_before
        return "growing" if ratio >= 1.3 else "slowing" if ratio <= 0.7 else "steady"
    return "growing" if n_now >= 40 else "steady"


def eta2(labels, y):
    """Share of the variance in y explained by the labels (0 to 1)."""
    labels, y = np.asarray(labels), np.asarray(y, float)
    ok = np.isfinite(y) & (labels != "unknown")
    labels, y = labels[ok], y[ok]
    if len(y) < 20 or len(set(labels)) < 2:
        return None, 0
    tot = ((y - y.mean()) ** 2).sum()
    if tot <= 0:
        return None, 0
    between = sum(len(y[labels == l]) * (y[labels == l].mean() - y.mean()) ** 2 for l in set(labels))
    return float(between / tot), int(len(y))


def validate(cats, outcomes, skip, rounds=400, seed=7):
    """For every facet and every outcome it was not built from: the variance explained, and how often shuffled
    labels explain as much (a permutation p-value)."""
    rng = np.random.default_rng(seed)
    out = {}
    for f in cats:
        res = {}
        for name, y in outcomes.items():
            if name in skip.get(f, ()):
                continue
            e, n = eta2(cats[f], y)
            if e is None:
                continue
            lab = np.asarray(cats[f]); yy = np.asarray(y, float)
            ok = np.isfinite(yy) & (lab != "unknown")
            lab, yy = lab[ok], yy[ok]
            null = [eta2(rng.permutation(lab), yy)[0] or 0 for _ in range(rounds)]
            res[name] = {"eta2": round(e, 3), "n": n, "chance": round(float(np.mean(null)), 3), "p": round(float((np.sum(np.array(null) >= e) + 1) / (rounds + 1)), 4)}
        out[f] = res
    return out

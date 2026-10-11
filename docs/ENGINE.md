# How the engine works

Campus Playbook has two halves. The offline engine (`engine/`, Python) reads the public sign-up data of every
Chabad on Campus center, does all the analysis and writes a handful of files. The Worker (`worker/`) serves those
files and the app, and turns one typed search into an embedding. The app (`src/`) only displays.

Nothing in the engine calls a language model. Text is compared with embeddings (bge-m3 through Workers AI);
everything else is rules, counting and statistics.

## The data

Source: the public, unauthenticated Chabad on Campus API (`api.chabadoncampus.org/api/1.0`). `engine/pull.py`
reads, for each center that uses the sign-up system, every event schedule (past, upcoming, canceled), plus the
center's and campus's public profile. About 950 requests, three at a time, with pauses.

Per event: name, description, tagline, flyer URL, local date and time, location, capacity, fee, state, and the
number of sign-ups. There is no event-type field, so the engine works types out itself. Flyer images are never
downloaded; the app shows them from their original URL.

First run, October 2026: 54,607 events at 145 centers since September 2020. 51,141 ran. 28,672 had at least one
sign-up, and 22,178 had none, because most centers do not take sign-ups for every event. Zero is treated as
"not measured", never as a failed event.

## Stages (`python -m engine.run`)

1. **prepare** Tidy tables. Three calendars are attached to every date: civil, Jewish (holiday windows, run-up
   weeks, the weekly Torah portion, a leap-year-normalized day of the Jewish year) and academic (each center's own
   fall and spring start is inferred from when its events resume, giving a week-of-semester for every event).
2. **types** Twenty event types. Rules on the name, description, weekday, hour and holiday window place 97% of
   events. The rest are placed by their nearest neighbors in embedding space when the neighbors agree (held-out
   agreement with the rules: 88%).
3. **embed** One embedding per distinct event text, cached, so a daily run only embeds what is new.
4. **score** The fair score. Raw sign-ups are never compared between centers. Each event is read against the
   median of the same center's same-type events within a year either side: `lift = (sign-ups + 2) / (median + 2)`.
   With fewer than four same-type events the center's overall median is used. A second score, `adj`, also divides
   out the usual rise and fall of a semester for that type, so an event is not rewarded for landing in week two.
5. **themes** Shabbat dinner themes. The words a center adds to "Shabbat dinner" are extracted, house brands
   (a center's own name for its weekly dinner) are set aside, and a phrase becomes a theme when at least three
   centers use it. Near-identical phrases are merged by embedding. A themed dinner is scored against the same
   center's plain dinners within 45 days.
6. **programs** A program is one event name at one center. 13,424 of them.
7. **ideas** The same program at different centers. Within each type, programs are clustered on a blend of
   embedding similarity (0.65) and character n-gram similarity of the names (0.35), average linkage, then clusters
   with the same folded name are merged. An idea needs two centers. 981 ideas.
8. **centers** No clustering. Each center is described on seven facets, each with a few named answers decided
   by a written rule (`engine/categories.py`): campus setting, Jewish students served, biggest draw, calendar
   volume, calendar emphasis, use of sign-ups, and stage on the system. US campuses are placed with federal data
   (IPEDS institutional characteristics and student aid files, and the College Scorecard), matched once by
   `engine/reference/build_us_campuses.py` and committed as `engine/reference/us_campuses.json`: public or
   private, Carnegie class, admission rate, enrollment, and the share of first-year students living with family.
   "Biggest draw" is the average of a center's five biggest events in three years, because an ordinary dinner
   often takes no sign-ups while a big event nearly always does. Peers ("centers like this one") are scored half
   on match (kind of campus, Jewish population, draw) and half on how alike the calendars and programs are. A
   center with under 15 events is matched on campus alone. "Gaps" are ideas several peers run that the center has
   nothing close to, by cluster, by meaning or by name. For every answer of every facet the engine also lists the
   ideas far more common there than elsewhere and the ideas that beat normal there.
9. **timing** Weekday by hour tables, weekday, hour, month, fall against spring, week of semester, Jewish and
   secular holidays. A slot is called reliable only with 25 scored events from 6 centers. Lifts in these tables
   are divided by the group's typical score, so 1.0 means a typical event of that kind.
10. **home, niches** What is posted and held in a rolling window (last 14 days, next 21) against the same window
    a year earlier, recent wins, audiences, partners, off-site events.
11. **export** Page payloads as JSON, plus the search index: every program vector reduced to 256 dimensions by
    PCA and stored as int8 (about 3.4 MB). The browser compares a typed idea with all of them directly.

## Checks the engine runs on itself

- Search index: the reduced vectors return 92% of the true top-10 neighbors of the full vectors.
- Types: 88% agreement between the neighbor method and the rules on held-out events.
- Center categories: for each facet, the share of variance it explains in things it was not built from, against
  shuffled labels. Jewish population explains about a third of the differences in biggest draw. Campus setting
  explains about 15% of draw and 18% of how much of the calendar is classes or Shabbat, and little about holidays.
  A center's five nearest peers share its campus setting 68% of the time, against 16% by chance. An earlier
  version grouped centers with k-means; the groups overlapped almost completely (silhouette 0.10) and were dropped.
- Prediction: scoring a held-out program from its nearest neighbors' results has a rank correlation of about 0.30
  with what happened (0.06 using type alone). The top fifth of predictions beat normal 54% of the time, the bottom
  fifth 22%. That is an edge, not a forecast, and the app says so.

## Limits

- Sign-ups are not attendance.
- A center that rarely takes sign-ups has noisy numbers; 94 of 145 centers use them steadily.
- A lift says how an event did against that center's own habit. It does not say why.
- Only public data is used. No student data, no names, no contact details.

## Running it

```
pip install -r engine/requirements.txt
python -m engine.pull          # public API -> engine/data/raw
python -m engine.run push      # compute -> engine/data/out -> the Worker's bucket
```

`.github/workflows/analyst.yml` runs both once a day. The job holds no secret: the Worker accepts a short-lived
token that GitHub signs for that workflow on `main` (`worker/oidc.js`). For a run from a laptop, set
`ANALYST_KEY` to the Worker's secret of the same name.

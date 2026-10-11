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
3. **embed** Each event's name and blurb are cleaned first (`engine/textprep.py`): dates, times, prices, links,
   sign-up instructions and the center's own name come out. The name and the blurb are then embedded separately
   (bge-m3 through Workers AI), each set is centered on its own average, and the two are averaged. A post with no
   blurb is its name alone, so it sits in the same space as everything else. Vectors are cached, so a daily run
   only embeds what is new.
4. **score** The fair score. Raw sign-ups are never compared between centers. Each event is read against the
   median of the same center's same-type events within a year either side: `lift = (sign-ups + 2) / (median + 2)`.
   With fewer than four same-type events the center's overall median is used. A second score, `adj`, also divides
   out the usual rise and fall of a semester for that type, so an event is not rewarded for landing in week two.
   A third number, the percentile, places the event among all of its own center's events around that time
   (0 smallest, 1 biggest). It is what the neighbor system predicts, because it is fair between centers of any
   size and does not depend on whether a center takes sign-ups at every dinner.
5. **themes** Shabbat dinner themes. The words a center adds to "Shabbat dinner" are extracted, house brands
   (a center's own name for its weekly dinner) are set aside, and a phrase becomes a theme when at least three
   centers use it. Near-identical phrases are merged by embedding. A themed dinner is scored against the same
   center's plain dinners within 45 days.
6. **programs** A program is one event name at one center. 13,424 of them.
7. **ideas** The same program at different centers. Within each type, programs are clustered on a blend of
   embedding similarity (0.65) and character n-gram similarity of the names (0.35), average linkage, then clusters
   with the same folded name are merged. An idea needs two centers. 981 ideas.
8. **centers and neighbors** Centers are described by what they do, never by kind of school: sign-ups at a
   typical event and at their biggest events, events a week, Jewish students served and the share of them it
   draws, and which kinds of event land high among its own events (`engine/neighbors.py`, `engine/centers.py`).
   Each measure is cut into bands with written cut points (`engine/categories.py`). The engine also tests whether
   centers form natural clumps on all measures together (k-means for 3 to 6 groups, resampled); they do not
   (agreement about 0.6 at best, where 1 is the same groups every time), so no blended clusters are published.

   "Centers like this one" is nearest neighbors on four measures with equal weight: biggest events, events a
   week, Jewish students, and the profile of which kinds of event do well.

   The neighbor system answers "how will this event do at this center": the past programs most like the event
   (cosine to the 4th power), weighted by how alike the two centers are (times 8 for the center's own history) and
   by how many runs each has, 100 heaviest, averaged on the percentile scale. The percentile becomes expected
   sign-ups through the asking center's own spread of sign-ups, with the weighted 25th to 75th percentile as a
   range. The engine runs this for every center against every idea and publishes "new for this center" (at
   least two of its twelve nearest centers ran it, and it has nothing close) and "worth running again".
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
- Types: the neighbor method agrees with the rules on 93% of held-out events (88% with the first embeddings).
- The neighbor system, replayed: the engine stands one year back, hides everything after, and predicts every
  program that was new to its center in the hidden year (2,569 programs at 96 centers). The top fifth of
  predictions landed in their center's top third of events 71% of the time, the bottom fifth 6%. Rank correlation
  with what happened is 0.56. Expected sign-ups are rougher: off by a factor of 1.6 at the median, within a factor
  of 1.5 for 42%. Piece by piece: kind of event alone 0.33, similar events at other centers 0.46, adding likeness
  between centers 0.48, adding the center's own history 0.56. The settings were chosen on the year before (0.50).
- Embeddings: three models (bge-m3, qwen3-embedding-0.6b, embeddinggemma-300m) were compared on three jobs built
  from this data: a search test of 50 typed ideas with hand-written match rules, telling kinds of event apart, and
  predicting results. bge-m3 won or tied each, so the model stayed. Cleaning the text and embedding name and blurb
  apart raised the search score from 0.745 to 0.774 and the kinds score from 0.77 to 0.83; adding an exact-wording
  match (character n-grams, in the browser) raised search to about 0.83. For predicting turnout the new vectors
  are level with the old (`engine/embedding_tests.json`).

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

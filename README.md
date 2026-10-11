# Campus Playbook

What Chabad on Campus centers run, when it works, and what to try next. Built on the public Chabad on Campus
RSVP data (every center, every event since 2020) with embeddings, clustering and statistics. No language-model
calls anywhere in the engine.

- `engine/` the offline engine (Python). Pulls the public API, classifies and scores events, embeds them, finds
  Shabbat dinner themes and program ideas, matches centers to their nearest peers, and writes the page payloads.
- `worker/` the Cloudflare Worker: serves the app and the engine's blobs from R2, and turns one typed idea into an
  embedding. It does no analysis.
- `src/` the app (React).

How the engine works and why each method was chosen: [docs/ENGINE.md](docs/ENGINE.md).

Deploys automatically from `main` through Cloudflare Workers Builds.

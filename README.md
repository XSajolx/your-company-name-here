# Anthropic (Demo Build)

A fully self-contained, **mock-data** copy of the CX Insights dashboard. It runs with
**no environment variables, no Supabase project, and no backend** — every data source
is replaced by an in-browser mock that generates deterministic, realistic-looking data.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm run build` produces a static `dist/` you can host anywhere.

The login screen is bypassed automatically — the app boots straight into the dashboard
as a demo admin user (so every role-gated tab is visible).

## How the mock works

Nothing in the ~70 UI components was changed. The real data boundaries are swapped out:

| Real dependency | Replaced by |
| --- | --- |
| `@supabase/supabase-js` | `src/mocks/mockSupabase.js` (aliased in `vite.config.js`). A fake auth session + a chainable query-builder that **honors filter predicates** (`.eq/.in/.gte/.not/…`) against generated rows, so the app's own aggregations produce sensible numbers. |
| `/api/*` serverless functions | `src/apiAuth.js` — a `fetch` shim that answers `/api/*` requests with mock JSON. `/api/dashboard-data` is fully aggregated by `buildDashboardData()` in the mock. |
| Supabase env vars / tokens | none — removed entirely. |

Mock data is **seeded** (deterministic), so charts look identical on every reload.
Tune volumes/shape in `src/mocks/mockSupabase.js`.

## Coverage

Rich, fully-working mock data:

- **Conversation Topics** — conversations, topics, sentiment, country/region charts
- **CSAT** — overall/CEx/product CSAT, trends, country & category breakdowns
- **Service Performance Overview** (Live Chat) — knock counts, FRT/ART/AHT, hit rates,
  teammate leaderboard, heatmaps, country distribution, period-over-period deltas
- **Sentiment Analysis**, **Country Performance**, **agent / team-lead filters**
- **Ticket Analytics** — ticket & knock counts

Intentionally empty / partial (schema not reproduced — would need the real table shape):

- Ticket **SLA** sub-metrics (`ticket_logs` SLA columns)
- SPO **FIN** and **Fundee** sub-segments
- **Trustpilot**, **Daily Report**, **Supervisor Evaluation**, **Topic Analyzer Admin**
  actions, and the **API Usages** embed (external iframe removed)

These render without errors — they just show empty states.

---
Derived from the CX Insights production deployment (2026-08-18) as a data-free demo.

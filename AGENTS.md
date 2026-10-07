# AGENTS.md

Agents may: search catalogues (CMR, PDS, ODE, ADS, NTRS), write acquisition code in
`src/acquire`, orchestrate steps, and explain results already returned by the API.

Agents may not: compute similarity, statistics, slopes or scores themselves, or state
any number that is not in a tool/API result. Call `src/compute` instead.

Every claim needs a `source_url` and a `dataset_id`. If a fetch fails, say so and use
the cached value with its timestamp. Do not estimate a missing number.

See `DEVELOPMENT.md` for commands and `docs/REVIEW.md` for known problems.

Interface work follows `DESIGN.md` (tokens, type, icons, motion, do and don't).

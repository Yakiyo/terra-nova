# DEVELOPMENT.md

NASA Space Apps 2026 (Bangladesh), challenge: **Identify Earth Locations that Analog
the Permanent Moon Base Locations and Mars**. Ranks Earth locations against lunar and
Martian target sites.

## Non-negotiables
- Offline-first. The API reads only `cache/` and `data/`. Every network fetch goes
  through `src/acquire/download.py`, and `OFFLINE=1` must keep working.
- Deterministic science (similarity, statistics, geometry) lives in `src/compute`.
  No language model computes or invents a number.
- Every number carries a `dataset_id` and a `source_url` (see `data/targets.json`).
  The tests enforce this.
- Never quote a score in docs or video that `scripts/check_controls.py` or the API
  did not produce.
- Apache-2.0. Public repo. No under-18 names, voices or likenesses in any media.
- Record AI use in `docs/AI_USE.md` as you go.

## Commands (Python 3.12, venv in .venv)
- Setup:     `powershell -File scripts/setup.ps1`
- Tests:     `python -m pytest tests -q`
- Lint:      `python -m ruff check src tests scripts && python -m ruff format src tests scripts`
- Controls:  `OFFLINE=1 python -m scripts.check_controls`
- Run:       `OFFLINE=1 uvicorn src.api.main:app --reload`, then open http://127.0.0.1:8000/
- Data:      `python -m src.acquire.build_predictor_stack`, `python -m src.acquire.calibrate`, `python -m src.acquire.basemaps`
- Offline demo prefetch (gitignored caches): `python -m src.acquire.tiles --level 1`, `python -m src.acquire.tiles --level 2 --around-top 20`, `python -m src.acquire.sitetiles --top 5`, `python -m src.acquire.peek`
- God's Eye default-results preparation: `python -m src.acquire.sitetiles` caches elevation and satellite imagery using Finder's discovery filters. `--terrain-only` skips satellite imagery and leaves uncached sites in shaded relief. The acquisition command downloads explicitly even from an `OFFLINE=1` shell; the running offline server stays offline. Copy `cache/sitetiles` with the app for an offline demo.
- UI smoke test (app running on :8000): `node scripts/ui_smoke.mjs`
- JS syntax check: `node --input-type=module --check < web/app.js` (plain `node --check` misses module errors)

## Adding a criterion
Four places must agree: `CRITERIA` in `src/compute/similarity.py`,
`data/normalization.json` (range, weight, source), a stage in
`src/acquire/build_predictor_stack.py`, and every target in `data/targets.json`.
Then run `python -m src.acquire.build_predictor_stack --stage assemble` and
`python -m src.acquire.calibrate`.

## Data rules
- Targets beyond Earth's range are clamped to the 0.5-99.5th percentile envelope.
- Terrain targets measured at metre scale use `earth_percentile` + `measured_value`.
- Validation: `/api/validation` must stay at ROC-AUC >= 0.9 (a test enforces it).

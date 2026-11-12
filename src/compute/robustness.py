"""How much do the results depend on uncertain inputs?

Two deterministic analyses (fixed random seed, so repeated calls agree):

Uncertainty (Monte Carlo)
    Target values are measurements or editorial classes with unknown error bars.
    Each used target value is perturbed with Gaussian noise whose standard
    deviation is a fraction of that criterion's scoring range, set by the
    target's own stated confidence (see ``NOISE``). For every run the whole Earth
    is re-scored; a site's *stability* is the share of runs in which it stays in
    the top 1% of land cells.

Sensitivity (leave one criterion out)
    For each active criterion, re-score with its weight set to 0 and report the
    validation ROC-AUC and the new top site. A result that survives dropping
    any single criterion does not hinge on one dataset.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

import numpy as np

from src.compute import validation
from src.compute.similarity import CRITERIA, CriterionRange, compute_similarity, rank_top

# Standard deviation of the perturbation, as a fraction of the criterion's range.
NOISE = {"high": 0.03, "medium": 0.08, "low": 0.15}
RUNS = 48
SEED = 20261113
TOP_SHARE = 0.01


def _threshold(score: np.ndarray, share: float) -> float:
    finite = score[np.isfinite(score)]
    return float(np.quantile(finite, 1.0 - share))


def stability(
    stack: Mapping[str, np.ndarray],
    profile: Mapping[str, float | None],
    confidence: Mapping[str, str],
    weights: Mapping[str, float],
    ranges: Mapping[str, CriterionRange],
    cells: list[int],
    tolerance: Mapping[str, float] | None = None,
    runs: int = RUNS,
    seed: int = SEED,
) -> dict[str, Any]:
    """Share of perturbed runs in which each cell stays in the top 1% of land."""
    rng = np.random.default_rng(seed)
    hits = np.zeros(len(cells), dtype=np.int64)
    flat = np.asarray(cells, dtype=np.int64)
    for _ in range(runs):
        noisy: dict[str, float | None] = {}
        for key in CRITERIA:
            value = profile[key]
            if value is None:
                noisy[key] = None
                continue
            sd = NOISE.get(confidence.get(key, "medium"), NOISE["medium"]) * ranges[key].span
            noisy[key] = float(value) + float(rng.normal(0.0, sd))
        result = compute_similarity(stack, noisy, weights, ranges, tolerance)
        cut = _threshold(result.score, TOP_SHARE)
        hits += result.score.ravel()[flat] >= cut
    return {
        "runs": runs,
        "seed": seed,
        "top_share": TOP_SHARE,
        "noise": NOISE,
        "stability": [round(float(h) / runs, 4) for h in hits],
    }


def sensitivity(
    stack: Mapping[str, np.ndarray],
    profile: Mapping[str, float | None],
    weights: Mapping[str, float],
    ranges: Mapping[str, CriterionRange],
    body: str,
    tag: str | None,
    mask: np.ndarray,
    catalog: Mapping[str, Any] | None = None,
    tolerance: Mapping[str, float] | None = None,
    top_of: Callable[[Any], int | None] | None = None,
) -> list[dict[str, Any]]:
    """Validation AUC and top cell with each active criterion removed in turn.

    ``tolerance`` and ``top_of`` (the caller's own ranking rule, given a scoring result)
    keep the "without X" results comparable with the headline ranking.
    """
    out = []
    active = [k for k in CRITERIA if weights.get(k, 0) > 0 and profile.get(k) is not None]
    for key in active:
        if len(active) == 1:
            break
        reduced = {**weights, key: 0.0}
        result = compute_similarity(stack, profile, reduced, ranges, tolerance)
        report = validation.validate(result.score, body, catalog, tag)
        if top_of is not None:
            top_index = top_of(result)
        else:
            top = rank_top(result.score, mask, k=1)
            top_index = top[0] if top else None
        out.append({"without": key, "auc": report["auc"], "top_index": top_index})
    return out

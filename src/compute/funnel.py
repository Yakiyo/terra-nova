"""Elimination funnel: how Earth's land narrows down, one condition at a time.

For a scored target, criteria are applied in order of weight (heaviest first). After
each step, a cell "survives" if its similarity to the target is at least ``threshold``
for every criterion applied so far. Similarity is the linear closeness used by the
score itself (``similarity.criterion_similarity``): 1 at the target value, falling to 0
one full Earth range away, so 0.8 means "within a fifth of Earth's full range".

This is an explanatory view of the same arithmetic as the score, not a second model:
the ranking itself always uses the full weighted score.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from src.compute.similarity import SimilarityResult

DEFAULT_THRESHOLD = 0.8


def elimination_funnel(
    result: SimilarityResult, valid: np.ndarray, threshold: float = DEFAULT_THRESHOLD
) -> tuple[dict[str, Any], np.ndarray]:
    """Return (summary, level) where ``level`` is the last step each land cell passed.

    ``level`` is float32: NaN outside scorable land, 0 for land that fails the first
    condition, and k for land that passes the first k conditions.
    """
    if not 0.0 < threshold <= 1.0:
        raise ValueError("threshold must be in (0, 1]")
    order = sorted(
        (k for k, w in result.weights.items() if w > 0 and result.effective_target.get(k) is not None),
        key=lambda k: -result.weights[k],
    )
    alive = np.asarray(valid, dtype=bool).copy()
    level = np.where(alive, 0.0, np.nan).astype(np.float32)
    steps = []
    for i, key in enumerate(order, start=1):
        sim = np.nan_to_num(np.asarray(result.similarities[key], dtype=np.float64), nan=0.0)
        alive &= sim >= threshold
        level[alive] = i
        steps.append(
            {"key": key, "weight": round(float(result.weights[key]), 4), "remaining": int(alive.sum())}
        )
    summary = {"total": int(np.count_nonzero(valid)), "threshold": threshold, "steps": steps}
    return summary, level

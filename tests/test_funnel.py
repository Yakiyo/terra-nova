import numpy as np

from src.compute.funnel import elimination_funnel
from src.compute.similarity import SimilarityResult


def _result(sims, weights):
    shape = next(iter(sims.values())).shape
    return SimilarityResult(
        score=np.ones(shape), similarities=sims, factors={}, weights=weights,
        target={k: 0.0 for k in sims}, effective_target={k: 0.0 for k in sims}, ranges={},
    )


def test_funnel_applies_heaviest_first_and_only_shrinks():
    sims = {"a": np.array([[1.0, 0.9, 0.1, 1.0]]), "b": np.array([[1.0, 0.2, 1.0, 0.9]])}
    valid = np.array([[True, True, True, False]])
    summary, level = elimination_funnel(_result(sims, {"a": 0.3, "b": 0.7}), valid, 0.8)
    assert [s["key"] for s in summary["steps"]] == ["b", "a"]
    assert summary["total"] == 3
    assert [s["remaining"] for s in summary["steps"]] == [2, 1]
    assert level[0, 0] == 2 and level[0, 1] == 0 and level[0, 2] == 1
    assert np.isnan(level[0, 3])


def test_funnel_skips_unused_criteria():
    sims = {"a": np.array([[1.0]]), "b": np.array([[np.nan]])}
    r = _result(sims, {"a": 1.0, "b": 0.0})
    summary, _ = elimination_funnel(r, np.array([[True]]))
    assert [s["key"] for s in summary["steps"]] == ["a"]

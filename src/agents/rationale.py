"""Deterministic rationale agent: why a cell scored what it scored.

This is a *rule-based explainer*, not a language model. Every sentence is
assembled from the numbers in :mod:`src.compute.similarity` plus the provenance
record in ``data/targets.json``, so the same request always returns the same
words. Each numeric statement carries the ``dataset_id`` and ``source_url`` of
the dataset it came from.

No network access and no model call is involved. The structure is deliberately
LLM-shaped (headline, per-criterion claims, caveats) so a language model could
verbalise the same payload later without changing the API.
"""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from src.acquire.download import REPO_ROOT
from src.compute.gazetteer import Label
from src.compute.similarity import (
    CRITERIA,
    CriterionRange,
    SimilarityResult,
    load_normalization,
)

TARGETS_PATH = REPO_ROOT / "data" / "targets.json"

QUALITATIVE_BANDS: tuple[tuple[float, str], ...] = (
    (0.90, "excellent match"),
    (0.75, "strong match"),
    (0.50, "moderate match"),
    (0.25, "weak match"),
    (0.00, "poor match"),
)


class RationaleError(RuntimeError):
    """Raised when a rationale cannot be produced from the supplied evidence."""


@dataclass(frozen=True)
class Claim:
    """One numeric statement together with the dataset it came from."""

    text: str
    criterion: str | None
    dataset_id: str | None
    source_url: str | None

    def as_dict(self) -> dict[str, object]:
        return {
            "text": self.text,
            "criterion": self.criterion,
            "dataset_id": self.dataset_id,
            "source_url": self.source_url,
        }


@dataclass(frozen=True)
class Rationale:
    headline: str
    claims: tuple[Claim, ...]
    caveats: tuple[Claim, ...]
    drivers: tuple[str, ...]
    score: float

    def as_dict(self) -> dict[str, object]:
        return {
            "headline": self.headline,
            "score": round(self.score, 6),
            "drivers": list(self.drivers),
            "claims": [claim.as_dict() for claim in self.claims],
            "caveats": [caveat.as_dict() for caveat in self.caveats],
        }


def load_targets(
    path: str | Path | None = None,
    ranges: Mapping[str, CriterionRange] | None = None,
) -> dict[str, dict[str, object]]:
    """Target catalogue with every criterion resolved to a numeric ``value``.

    Criteria given as an ``earth_percentile`` terrain class are resolved through
    the Earth quantile table in data/normalization.json.
    """
    source = Path(path) if path is not None else TARGETS_PATH
    raw = json.loads(source.read_text(encoding="utf-8"))
    specs = ranges if ranges is not None else load_normalization()
    for entry in raw["targets"]:
        for key, criterion in entry["criteria"].items():
            if "value" not in criterion and "earth_percentile" in criterion:
                value = specs[key].value_at_percentile(float(criterion["earth_percentile"]))
                criterion["value"] = round(value, 4)
    return {str(entry["id"]): entry for entry in raw["targets"]}


def band_for(similarity: float) -> str:
    for threshold, name in QUALITATIVE_BANDS:
        if similarity >= threshold:
            return name
    return QUALITATIVE_BANDS[-1][1]


def format_value(value: float, unit: str) -> str:
    """Render a predictor value with its unit, deterministically."""
    if not math.isfinite(value):
        return "no data"
    magnitude = abs(value)
    text = f"{value:,.0f}" if magnitude >= 100 else f"{value:.2f}".rstrip("0").rstrip(".")
    if unit == "1":
        return text
    if unit == "fraction":   # basaltic_volcanic: three rock classes (see src/acquire/glim.py)
        rock = "basaltic" if value >= 1 else "intermediate volcanic" if value >= 0.5 else "not volcanic"
        return f"{rock} ({text})"
    if unit == "degrees":
        return f"{text} degrees"
    return f"{text} {unit}"


def explain_cell(
    result: SimilarityResult,
    stack: Mapping[str, np.ndarray],
    target_id: str,
    index: int,
    label: Label | None = None,
    *,
    grid_shape: tuple[int, int] | None = None,
    targets: Mapping[str, Mapping[str, object]] | None = None,
    top_drivers: int = 3,
) -> Rationale:
    """Explain one cell of one score surface.

    Parameters
    ----------
    result:
        Output of :func:`src.compute.similarity.compute_similarity`.
    stack:
        The raw predictor arrays the score was computed from, so the explainer
        can quote physical values rather than only similarities.
    target_id:
        Key into ``data/targets.json``.
    index:
        Flat index of the cell in row-major (north-to-south, west-to-east) order.
    """
    catalogue = dict(targets) if targets is not None else load_targets()
    if target_id not in catalogue:
        raise RationaleError(f"unknown target {target_id!r}")
    target_entry = catalogue[target_id]
    target_criteria = target_entry["criteria"]

    width = grid_shape[1] if grid_shape else result.score.shape[1]
    row, col = divmod(int(index), width)
    score = float(result.score[row, col])
    if not math.isfinite(score):
        raise RationaleError("cannot explain a cell that has no score")

    where = "" if label is None else f" - {label.text}"
    headline = (
        f"Scores {score:.0%} against {target_entry['short_name']} ({target_entry['body']}){where}."
    )

    active = [key for key in CRITERIA if result.weights[key] > 0]
    order = sorted(
        active, key=lambda key: (-float(result.similarities[key][row, col]), CRITERIA.index(key))
    )
    drivers = tuple(order[:top_drivers])

    claims: list[Claim] = []
    for key in order:
        spec: CriterionRange = result.ranges[key]
        meta = target_criteria[key]
        similarity = float(result.similarities[key][row, col])
        raw_value = float(np.asarray(stack[key])[row, col])
        if not math.isfinite(raw_value):
            continue
        target_value = float(result.target[key])  # type: ignore[arg-type]
        effective = float(result.effective_target[key])  # type: ignore[arg-type]

        if key in drivers:
            lead = f"{spec.label} is a main driver"
        elif similarity < 0.35:
            lead = f"{spec.label} is the weakest fit"
        else:
            lead = f"{spec.label}"

        target_text = f"a target of {format_value(effective, spec.unit)}"
        if "earth_percentile" in meta:
            measured = meta.get("measured_value")
            measured_text = (
                f"; measured {format_value(float(measured), spec.unit)}"
                f" at {meta.get('baseline') or 'a finer scale'}"
                if measured is not None
                else "; qualitative"
            )
            target_text += (
                f" (Earth-percentile class: {float(meta['earth_percentile']):.0f}th{measured_text})"
            )
        elif not math.isclose(effective, target_value, rel_tol=1e-9, abs_tol=1e-9):
            edge = "upper" if target_value > effective else "lower"
            target_text += (
                f" (the real target, {format_value(target_value, spec.unit)}, lies outside the"
                f" range covering 99% of Earth's land, so the {edge} edge of that range is used)"
            )

        claims.append(
            Claim(
                text=(
                    f"{lead}: {format_value(raw_value, spec.unit)} against {target_text}"
                    f" - {band_for(similarity)} ({similarity:.0%})."
                ),
                criterion=key,
                dataset_id=str(meta.get("dataset_id") or "") or None,
                source_url=str(meta.get("source_url") or "") or None,
            )
        )

    caveats: list[Claim] = []
    for key in active:
        meta = target_criteria[key]
        note = str(meta.get("definition_note", "")).strip()
        baseline = str(meta.get("baseline", "") or "").strip()
        confidence = str(meta.get("confidence", "high"))
        if confidence == "high" and not baseline:
            continue
        if not note:
            continue
        prefix = ""
        if baseline:
            prefix = f"Measured over {baseline}, which is not the Earth predictor's own scale. "
        caveats.append(
            Claim(
                text=f"{result.ranges[key].label}: {prefix}{note}",
                criterion=key,
                dataset_id=str(meta.get("dataset_id") or "") or None,
                source_url=str(meta.get("source_url") or "") or None,
            )
        )

    units_note = str(target_entry.get("units_note", "")).strip()
    if units_note:
        caveats.append(
            Claim(
                text=units_note,
                criterion=None,
                dataset_id=None,
                source_url=str(target_entry.get("source_url") or "") or None,
            )
        )

    return Rationale(
        headline=headline,
        claims=tuple(claims),
        caveats=tuple(caveats),
        drivers=drivers,
        score=score,
    )

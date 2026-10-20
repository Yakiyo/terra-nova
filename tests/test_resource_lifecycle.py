"""Concurrency and cache ownership, without changing scientific calculations."""

import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor

from src.api import main


def test_state_loading_serializes_concurrent_callers(monkeypatch):
    state = main._State()
    entered = threading.Event()
    release = threading.Event()
    calls = []

    def load():
        calls.append(True)
        entered.set()
        assert release.wait(timeout=5)
        state.targets = {"ready": {}}
        state.stack = {}

    monkeypatch.setattr(state, "_load", load)
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(state.load)
        assert entered.wait(timeout=5)
        second = pool.submit(state.load)
        assert state.stack is None
        release.set()
        first.result(timeout=5)
        second.result(timeout=5)
    assert calls == [True]
    assert state.targets == {"ready": {}}


def test_robustness_cache_refreshes_recency_on_hits(monkeypatch):
    first = main.ScoreRequest(target_id="jezero_crater")
    second = main.ScoreRequest(target_id="lunar_south_pole")
    first_key = first.model_dump_json(exclude={"include_field"})
    second_key = second.model_dump_json(exclude={"include_field"})
    cached = {"cached": True}
    cache = OrderedDict([(first_key, cached), (second_key, cached)])
    monkeypatch.setattr(main, "_ROBUSTNESS_CACHE", cache)
    assert main.robustness_report(first) is cached
    assert list(cache) == [second_key, first_key]


def test_robustness_cache_evicts_oldest_without_flushing_recent_reports(monkeypatch):
    monkeypatch.setattr(main, "_ROBUSTNESS_CACHE", OrderedDict())
    monkeypatch.setattr(main, "_ROBUSTNESS_LIMIT", 2)
    requests = [main.ScoreRequest(target_id="jezero_crater", top_k=top) for top in (1, 2, 3)]
    first, second, third = requests
    main.robustness_report(first)
    main.robustness_report(second)
    main.robustness_report(first)
    main.robustness_report(third)

    def key(request):
        return request.model_dump_json(exclude={"include_field"})

    assert list(main._ROBUSTNESS_CACHE) == [key(first), key(third)]

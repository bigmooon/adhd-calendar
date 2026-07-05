#!/usr/bin/env python3
"""track_progress.py의 순수 함수(XP/스트릭/균형 계산)에 대한 최소 assert 기반 자체 점검."""
from collections import Counter

from track_progress import balance_percentages, update_streak, xp_level


def test_xp_level():
    assert xp_level(0) == (1, 0, 100)
    assert xp_level(99) == (1, 99, 1)
    assert xp_level(100) == (2, 0, 100)
    assert xp_level(250) == (3, 50, 50)


def test_update_streak():
    s = {"current": 0, "longest": 0, "last_date": None}
    s = update_streak(s, "2026-07-01")
    assert s == {"current": 1, "longest": 1, "last_date": "2026-07-01"}

    s = update_streak(s, "2026-07-02")  # 연속된 다음 날
    assert s["current"] == 2 and s["longest"] == 2

    s = update_streak(s, "2026-07-02")  # 같은 날 중복 커밋은 무시
    assert s["current"] == 2

    s = update_streak(s, "2026-07-05")  # 3일 건너뜀 -> 리셋
    assert s["current"] == 1 and s["longest"] == 2


def test_balance_percentages():
    categories = {"a": {}, "b": {}, "c": {}}
    counts = Counter({"a": 3, "b": 1})
    pct = balance_percentages(counts, categories)
    assert pct == {"a": 75, "b": 25, "c": 0}


if __name__ == "__main__":
    test_xp_level()
    test_update_streak()
    test_balance_percentages()
    print("모든 자체 점검 통과")

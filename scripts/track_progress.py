#!/usr/bin/env python3
"""GitHub 커밋을 감지해 코딩테스트/CS/프로젝트/이력서 균형 통계와 XP를 data.json에 기록.

실행: python3 scripts/track_progress.py
전제: `gh` CLI가 로그인되어 있어야 함 (gh auth status).
"""
import json
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data.json"

DEFAULT_CONFIG = {
    "owner": "bigmooon",
    "categories": {
        "coding_test": {
            "label": "코딩테스트",
            "xp_per_commit": 10,
            "repos": ["algo-study-notebooks", "LeetCode", "coding-test"],
        },
        "cs_study": {
            "label": "CS/학습",
            "xp_per_commit": 0,
            "repos": [
                "llm_eval", "llm-practice", "llm-study", "llm_agents", "nlp-practice",
                "chatbot", "love-imbalance-detector", "sangnyanghan-yangachi",
                "pangyo-minutes", "nodejs-practice", "typescript-practice", "python-template",
            ],
        },
        "project": {
            "label": "프로젝트",
            "xp_per_commit": 0,
            "repos": [
                "django_qna_project", "shift", "portfolio", "Festival-pub",
                "contract-secretary", "bigmooon.github.io", "blaybus-frontend",
                "piyak-hackathon", "chat-app", "clone-apple-gsap-threejs",
                "QuantEz-FE", "QuantEZ", "practice", "nextJS",
                "eslint-prettier-configs", "adhd-calendar",
            ],
        },
        "resume": {
            "label": "이력서 작성",
            "xp_per_commit": 0,
            "local_paths": [str(Path.home() / "Documents" / "job_prep")],
        },
    },
}


def parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def xp_level(xp: int) -> tuple[int, int, int]:
    """(레벨, 현재 레벨 내 XP, 다음 레벨까지 남은 XP). 100XP당 1레벨, 순수 함수."""
    level = xp // 100 + 1
    xp_in_level = xp % 100
    return level, xp_in_level, 100 - xp_in_level


def update_streak(streak: dict, day: str) -> dict:
    """day(YYYY-MM-DD)에 코딩테스트 활동이 있었을 때 스트릭 갱신. 순수 함수 (입력을 변경하지 않음)."""
    streak = dict(streak)
    last_date = streak.get("last_date")
    if last_date == day:
        return streak  # 같은 날 중복 커밋은 스트릭에 영향 없음
    if last_date:
        gap = (datetime.fromisoformat(day) - datetime.fromisoformat(last_date)).days
        streak["current"] = streak["current"] + 1 if gap == 1 else 1
    else:
        streak["current"] = 1
    streak["last_date"] = day
    streak["longest"] = max(streak.get("longest", 0), streak["current"])
    return streak


def balance_percentages(counts: Counter, categories: dict) -> dict:
    total = sum(counts.values()) or 1
    return {key: round(counts.get(key, 0) / total * 100) for key in categories}


def load_data() -> dict:
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text())
    return {
        "config": DEFAULT_CONFIG,
        "last_check": None,
        "xp": 0,
        "streak": {"current": 0, "longest": 0, "last_date": None},
        "history": [],
    }


def save_data(data: dict) -> None:
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def gh_commits(owner: str, repo: str, since: str | None) -> list[dict]:
    # author= 로 GitHub 로그인 필터링은 커밋 git email이 계정에 연결(verified)돼 있어야 매칭됨.
    # 리포 자체가 owner 소유 리포만 나열한 것이라 author 필터 없이 전체 커밋을 사용.
    args = ["gh", "api", f"repos/{owner}/{repo}/commits", "--paginate"]
    if since:
        args += ["-f", f"since={since}"]
    try:
        out = subprocess.run(args, capture_output=True, text=True, timeout=20)
        if out.returncode != 0:
            return []
        return json.loads(out.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError):
        return []


def scan_local(paths: list[str], since_dt: datetime | None) -> list[dict]:
    events = []
    for p in paths:
        base = Path(p)
        if not base.exists():
            continue
        for f in base.rglob("*"):
            if not f.is_file() or any(part.startswith(".") for part in f.relative_to(base).parts):
                continue
            mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
            if since_dt is None or mtime > since_dt:
                events.append({"file": str(f.relative_to(base)), "mtime": mtime.isoformat()})
    return events


def collect_new_events(cfg: dict, since: str | None) -> list[dict]:
    since_dt = parse_iso(since) if since else None
    events = []
    for cat_key, cat in cfg["categories"].items():
        for repo in cat.get("repos", []):
            for c in gh_commits(cfg["owner"], repo, since):
                events.append({
                    "category": cat_key,
                    "repo": repo,
                    "date": c["commit"]["author"]["date"],
                    "sha": c["sha"][:7],
                    "message": c["commit"]["message"].splitlines()[0],
                    "xp": cat.get("xp_per_commit", 0),
                })
        for local_path in cat.get("local_paths", []):
            for act in scan_local([local_path], since_dt):
                events.append({
                    "category": cat_key,
                    "repo": "local:" + Path(local_path).name,
                    "date": act["mtime"],
                    "sha": None,
                    "message": act["file"],
                    "xp": cat.get("xp_per_commit", 0),
                })
    events.sort(key=lambda e: e["date"])
    return events


def apply_events(data: dict, events: list[dict]) -> None:
    for ev in events:
        data["xp"] += ev["xp"]
        data["history"].append(ev)
        if ev["category"] == "coding_test":
            data["streak"] = update_streak(data["streak"], ev["date"][:10])


def print_summary(data: dict, new_events: list[dict]) -> None:
    cfg = data["config"]
    level, xp_in_level, to_next = xp_level(data["xp"])
    print(f"레벨 {level} (XP {data['xp']}, 다음 레벨까지 {to_next})")
    print(f"코딩테스트 스트릭: {data['streak']['current']}일 연속 (최고 {data['streak']['longest']}일)")

    if new_events:
        print(f"\n새로 감지된 활동 {len(new_events)}건:")
        for ev in new_events:
            label = cfg["categories"][ev["category"]]["label"]
            print(f"  [{label}] {ev['repo']} — {ev['message']} ({ev['date'][:10]})")
    else:
        print("\n새 활동 없음.")

    now = datetime.now(timezone.utc)
    cutoff = now.timestamp() - 30 * 86400
    recent = [e for e in data["history"] if parse_iso(e["date"]).timestamp() >= cutoff]
    counts = Counter(e["category"] for e in recent)
    pct = balance_percentages(counts, cfg["categories"])
    print("\n최근 30일 균형:")
    for key, cat in cfg["categories"].items():
        bar = "█" * (pct[key] // 5)
        print(f"  {cat['label']:10s} {counts.get(key, 0):3d}건 {pct[key]:3d}% {bar}")


def main() -> None:
    if "--reset" in sys.argv:
        # ponytail: 과거 커밋을 소급 반영하지 않고 지금 이 순간부터만 카운트하고 싶을 때 사용
        data = {
            "config": DEFAULT_CONFIG,
            "last_check": datetime.now(timezone.utc).isoformat(),
            "xp": 0,
            "streak": {"current": 0, "longest": 0, "last_date": None},
            "history": [],
        }
        save_data(data)
        print("초기화 완료 — 지금부터의 활동만 XP로 집계합니다.")
        return

    data = load_data()
    new_events = collect_new_events(data["config"], data["last_check"])
    apply_events(data, new_events)
    data["last_check"] = datetime.now(timezone.utc).isoformat()
    save_data(data)
    print_summary(data, new_events)


if __name__ == "__main__":
    main()

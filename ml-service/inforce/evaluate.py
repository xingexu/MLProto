"""Evaluation harness.

A system's answer is correct only if it cites an accepted passage AND reports
the expected status. "Confidently stale" means the system said the requirement
is in force, but the passage it cited is not actually in force on that date
(superseded, draft, not yet effective, or not yet published).
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from .corpus import DATA_DIR, Corpus, load_corpus
from .engine import Engine, Mode
from .lifecycle import Status


@dataclass(frozen=True)
class Question:
    qid: str
    type: str
    question: str
    as_of: date
    rule_key: str
    accepted: tuple[str, ...]
    expected_status: Status
    situation: dict[str, date] | None = None


def load_questions(corpus: Corpus, path: Path | None = None) -> list[Question]:
    path = path or DATA_DIR / "questions.json"
    raw = json.loads(path.read_text(encoding="utf-8"))["questions"]
    out, seen = [], set()
    for q in raw:
        if q["qid"] in seen:
            raise ValueError(f"duplicate question id {q['qid']!r}")
        seen.add(q["qid"])
        for pid in q["accepted"]:
            if pid not in corpus.passages:
                raise ValueError(f"question {q['qid']}: unknown passage {pid!r}")
            if corpus.passages[pid].rule_key != q["rule_key"]:
                raise ValueError(f"question {q['qid']}: passage {pid} is not in rule {q['rule_key']}")
        situation = {k: date.fromisoformat(v) for k, v in q["situation"].items()} if q.get("situation") else None
        out.append(Question(q["qid"], q["type"], q["question"], date.fromisoformat(q["as_of"]), q["rule_key"],
                            tuple(q["accepted"]), Status(q["expected_status"]), situation))
    return out


def score(engine: Engine, q: Question, mode: Mode) -> dict[str, Any]:
    a = engine.ask(q.question, q.as_of, mode=mode, situation=q.situation)
    pid = a.citation.passage_id if a.citation else None
    correct = pid in q.accepted and a.status == q.expected_status
    confident_stale = (
        a.status == Status.IN_FORCE and pid is not None and a.true_status is not None
        and a.true_status != Status.IN_FORCE
    )
    return {
        "qid": q.qid, "type": q.type, "question": q.question, "as_of": q.as_of.isoformat(),
        "expected_status": q.expected_status.value, "accepted": list(q.accepted),
        "cited": pid, "claimed_status": a.status.value,
        "true_status": a.true_status.value if a.true_status else None,
        "rule_hit": a.rule_key == q.rule_key, "correct": correct, "confident_stale": confident_stale,
    }


def run(engine: Engine, questions: list[Question], modes: list[Mode] | None = None) -> dict[str, Any]:
    modes = modes or list(Mode)
    report: dict[str, Any] = {"n_questions": len(questions), "modes": {}}
    for mode in modes:
        rows = [score(engine, q, mode) for q in questions]
        n = len(rows) or 1
        by_type: dict[str, dict[str, float]] = defaultdict(lambda: {"n": 0, "correct": 0})
        for r in rows:
            by_type[r["type"]]["n"] += 1
            by_type[r["type"]]["correct"] += int(r["correct"])
        report["modes"][mode.value] = {
            "accuracy": sum(r["correct"] for r in rows) / n,
            "confident_stale_rate": sum(r["confident_stale"] for r in rows) / n,
            "rule_hit_rate": sum(r["rule_hit"] for r in rows) / n,
            "by_type": {t: {"n": v["n"], "accuracy": v["correct"] / v["n"]} for t, v in sorted(by_type.items())},
            "rows": rows,
        }
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the InForce evaluation set.")
    parser.add_argument("--json", action="store_true", help="print the full report as JSON")
    args = parser.parse_args()
    corpus = load_corpus()
    report = run(Engine(corpus), load_questions(corpus))
    if args.json:
        print(json.dumps(report, indent=2))
        return
    print(f"{report['n_questions']} questions\n")
    print(f"{'mode':<10} {'accuracy':>9} {'conf.stale':>11} {'rule hit':>9}")
    for mode, m in report["modes"].items():
        print(f"{mode:<10} {m['accuracy']:>9.0%} {m['confident_stale_rate']:>11.0%} {m['rule_hit_rate']:>9.0%}")


if __name__ == "__main__":
    main()

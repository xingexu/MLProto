from datetime import date

import pytest
from fastapi.testclient import TestClient

from inforce.api import app
from inforce.corpus import _build, load_corpus
from inforce.engine import Engine, Mode
from inforce.evaluate import load_questions, run
from inforce.lifecycle import Status, passage_status, resolve

corpus = load_corpus()
engine = Engine(corpus)
client = TestClient(app)


def status_of(pid: str, when: str, **situation) -> Status:
    sit = {k: date.fromisoformat(v) for k, v in situation.items()} or None
    return passage_status(corpus, corpus.passages[pid], date.fromisoformat(when), sit)


# --- lifecycle ---------------------------------------------------------------

@pytest.mark.parametrize("pid,when,expected", [
    ("b20-2021-mqr", "2021-05-01", Status.NOT_PUBLISHED),
    ("b20-2021-mqr", "2021-05-25", Status.NOT_YET_EFFECTIVE),
    ("b20-2021-mqr", "2021-06-01", Status.IN_FORCE),          # effective date is inclusive
    ("b20-2021-mqr", "2021-12-17", Status.SUPERSEDED),        # reaffirmation takes over
    ("b20-2017-mqr", "2021-05-31", Status.IN_FORCE),
    ("b20-2017-mqr", "2021-06-01", Status.SUPERSEDED),
    ("b20-2021-draft-mqr", "2026-01-01", Status.DRAFT),
    ("e21-2024-s3-resilience", "2026-08-31", Status.NOT_YET_EFFECTIVE),
    ("e21-2024-s3-resilience", "2026-09-01", Status.IN_FORCE),
])
def test_passage_status(pid, when, expected):
    assert status_of(pid, when) == expected


def test_grandfathering_needs_an_early_commitment():
    assert status_of("b20-2017-mqr", "2021-07-15", commitment_date="2021-05-10") == Status.GRANDFATHERED
    assert status_of("b20-2017-mqr", "2021-07-15", commitment_date="2021-06-01") == Status.SUPERSEDED


def test_resolve_reports_upcoming_change_and_pending_draft():
    res = resolve(corpus, "b20.mqr", date(2021, 5, 25))
    assert res.status == Status.IN_FORCE and res.primary.passage_id == "b20-2017-mqr"
    assert [p.passage_id for p in res.upcoming] == ["b20-2021-mqr"]


def test_resolve_draft_only():
    res = resolve(corpus, "e21.resilience", date(2024, 1, 15))
    assert res.status == Status.DRAFT and res.primary.passage_id == "e21-2023-draft-resilience"


def test_resolve_nothing_published():
    res = resolve(corpus, "e21.resilience", date(2020, 1, 1))
    assert res.status == Status.NONE and res.primary is None


# --- corpus validation ---------------------------------------------------------

def _raw(**passage_overrides):
    return {
        "regulations": [{"id": "X", "title": "t", "regulator": "OSFI", "topic": "t"}],
        "documents": [{"doc_id": "d", "reg_id": "X", "kind": "guideline", "title": "t",
                       "published": "2020-01-01", "source_url": "u", "verification": "v"}],
        "passages": [{"passage_id": "p", "doc_id": "d", "rule_key": "r", "heading": "h", "text": "t",
                      "effective_from": "2020-02-01", "answer": "a", **passage_overrides}],
    }


@pytest.mark.parametrize("override,message", [
    ({"effective_from": None}, "need effective_from"),
    ({"effective_from": "2019-01-01"}, "effective before it was published"),
    ({"doc_id": "missing"}, "unknown document"),
])
def test_corpus_validation(override, message):
    with pytest.raises(ValueError, match=message):
        _build(_raw(**override))


# --- engine and evaluation ---------------------------------------------------

def test_baseline_ignores_dates_but_lifecycle_does_not():
    q, when = "Does B-10 cover all third-party arrangements or only outsourcing?", date(2023, 9, 1)
    base = engine.ask(q, when, Mode.BASELINE)
    life = engine.ask(q, when, Mode.LIFECYCLE)
    assert base.status == Status.IN_FORCE and base.true_status != Status.IN_FORCE
    assert life.citation.passage_id == "b10-2009-scope" and life.status == Status.IN_FORCE
    assert any("May 1, 2024" in n for n in life.notes)


def test_empty_query_returns_none():
    assert engine.ask("the of and", date(2026, 1, 1)).status == Status.NONE


def test_eval_ordering():
    report = run(engine, load_questions(corpus))
    m = report["modes"]
    assert m["lifecycle"]["accuracy"] > m["recency"]["accuracy"] > m["baseline"]["accuracy"]
    assert m["lifecycle"]["confident_stale_rate"] == 0


# --- HTTP API --------------------------------------------------------------------

def test_health():
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_ask_endpoint_with_situation():
    r = client.post("/ask", json={
        "question": "Which qualifying rate applies to an uninsured mortgage pre-approved before the change?",
        "as_of": "2021-07-15", "situation": {"commitment_date": "2021-05-10"},
    })
    body = r.json()
    assert r.status_code == 200
    assert body["status"] == "GRANDFATHERED" and body["citation"]["passage_id"] == "b20-2017-mqr"
    assert body["as_of"] == "2021-07-15"


@pytest.mark.parametrize("payload", [
    {"question": "  "},
    {"question": "x" * 501},
    {"question": "qualifying rate", "as_of": "1990-01-01"},
    {"question": "qualifying rate", "mode": "magic"},
])
def test_ask_validation(payload):
    assert client.post("/ask", json=payload).status_code == 422


def test_timeline_and_404():
    r = client.get("/regulations/e-21/timeline", params={"as_of": "2025-10-01"})
    assert r.status_code == 200
    statuses = {v["passage_id"]: v["status"] for rule in r.json()["rules"] for v in rule["versions"]}
    assert statuses["e21-2024-s4-keyareas"] == "IN_FORCE"
    assert statuses["e21-2024-s3-resilience"] == "NOT_YET_EFFECTIVE"
    assert client.get("/regulations/Z-99/timeline").status_code == 404


def test_eval_endpoint_shape():
    body = client.get("/eval").json()
    assert set(body["modes"]) == {"baseline", "recency", "lifecycle"}
    assert body["n_questions"] == len(body["modes"]["baseline"]["rows"])

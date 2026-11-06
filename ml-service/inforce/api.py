"""FastAPI app exposing the engine, the timeline and the evaluation report."""

from __future__ import annotations

import dataclasses
from datetime import date
from functools import lru_cache
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field, field_validator

from .corpus import load_corpus
from .engine import Engine, Mode
from .evaluate import load_questions, run
from .lifecycle import passage_status

MIN_DATE, MAX_DATE = date(2000, 1, 1), date(2035, 12, 31)

app = FastAPI(title="InForce ML service", version="0.1.0")
corpus = load_corpus()
engine = Engine(corpus)
questions = load_questions(corpus)


class Situation(BaseModel):
    commitment_date: date | None = Field(
        default=None, description="Date the mortgage or arrangement was approved or committed, if relevant.")


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    as_of: date | None = None
    mode: Mode = Mode.LIFECYCLE
    situation: Situation | None = None

    @field_validator("question")
    @classmethod
    def strip(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("question is too short")
        return v

    @field_validator("as_of")
    @classmethod
    def in_range(cls, v: date | None) -> date | None:
        if v is not None and not (MIN_DATE <= v <= MAX_DATE):
            raise ValueError(f"as_of must be between {MIN_DATE} and {MAX_DATE}")
        return v


def _asdict(obj: Any) -> Any:
    return jsonable_encoder(dataclasses.asdict(obj) if dataclasses.is_dataclass(obj) else obj)


@lru_cache(maxsize=1)
def _eval_report() -> dict[str, Any]:
    return run(engine, questions)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "passages": len(corpus.passages), "questions": len(questions)}


@app.get("/regulations")
def regulations() -> list[dict[str, Any]]:
    out = []
    for reg in corpus.regulations.values():
        docs = sorted((d for d in corpus.documents.values() if d.reg_id == reg.id), key=lambda d: d.published)
        rules = list(dict.fromkeys(p.rule_key for p in corpus.passages.values() if corpus.reg_of(p).id == reg.id))
        out.append({**_asdict(reg), "rules": rules, "documents": [_asdict(d) for d in docs]})
    return out


@app.get("/regulations/{reg_id}/timeline")
def timeline(reg_id: str, as_of: date | None = Query(default=None)) -> dict[str, Any]:
    reg = corpus.regulations.get(reg_id.upper())
    if reg is None:
        raise HTTPException(404, f"Unknown regulation {reg_id!r}")
    when = as_of or date.today()
    rules = []
    # Rules keep the order they appear in the corpus (section order), not alphabetical order.
    rule_keys = dict.fromkeys(p.rule_key for p in corpus.passages.values() if corpus.reg_of(p).id == reg.id)
    for rule_key in rule_keys:
        chain = corpus.chain(rule_key)
        versions = []
        for p in sorted(chain, key=lambda q: (corpus.doc_of(q).published, q.passage_id)):
            doc = corpus.doc_of(p)
            versions.append({
                "passage_id": p.passage_id, "heading": p.heading, "answer": p.answer, "document": doc.title,
                "doc_id": doc.doc_id, "kind": doc.kind, "published": doc.published,
                "effective_from": p.effective_from, "status": passage_status(corpus, p, when),
                "source_url": doc.source_url, "verification": doc.verification,
            })
        finals = [p for p in chain if not corpus.is_draft(p)]
        rules.append({"rule_key": rule_key, "heading": (finals or chain)[-1].heading, "versions": versions})
    return jsonable_encoder({"regulation": _asdict(reg), "as_of": when, "rules": rules})


@app.post("/ask")
def ask(req: AskRequest) -> dict[str, Any]:
    situation = {"commitment_date": req.situation.commitment_date} \
        if req.situation and req.situation.commitment_date else None
    answer = engine.ask(req.question, req.as_of or date.today(), mode=req.mode, situation=situation)
    return _asdict(answer)


@app.get("/eval")
def evaluation() -> dict[str, Any]:
    return _eval_report()


@app.get("/passages/{passage_id}")
def passage(passage_id: str) -> dict[str, Any]:
    p = corpus.passages.get(passage_id)
    if p is None:
        raise HTTPException(404, f"Unknown passage {passage_id!r}")
    return _asdict(engine.cite(p))

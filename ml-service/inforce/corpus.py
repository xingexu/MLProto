"""Corpus loading and validation.

The corpus is a JSON file of regulations, documents (one per published version)
and passages (one per rule per version). Each passage belongs to a ``rule_key``;
passages sharing a rule_key form that rule's version chain.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

DOC_KINDS = {"guideline", "letter", "draft"}


@dataclass(frozen=True)
class Grandfather:
    situation_field: str
    before: date
    note: str


@dataclass(frozen=True)
class Regulation:
    id: str
    title: str
    regulator: str
    topic: str


@dataclass(frozen=True)
class Document:
    doc_id: str
    reg_id: str
    kind: str
    title: str
    published: date
    source_url: str
    verification: str


@dataclass(frozen=True)
class Passage:
    passage_id: str
    doc_id: str
    rule_key: str
    heading: str
    text: str
    effective_from: date | None
    answer: str
    grandfather: Grandfather | None = None
    transition_note: str | None = None


@dataclass
class Corpus:
    regulations: dict[str, Regulation]
    documents: dict[str, Document]
    passages: dict[str, Passage]
    chains: dict[str, list[Passage]] = field(default_factory=dict)

    def doc_of(self, p: Passage) -> Document:
        return self.documents[p.doc_id]

    def reg_of(self, p: Passage) -> Regulation:
        return self.regulations[self.doc_of(p).reg_id]

    def is_draft(self, p: Passage) -> bool:
        return self.doc_of(p).kind == "draft"

    def chain(self, rule_key: str) -> list[Passage]:
        return self.chains.get(rule_key, [])


def _d(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def _build(raw: dict[str, Any]) -> Corpus:
    regs = {r["id"]: Regulation(r["id"], r["title"], r["regulator"], r["topic"]) for r in raw["regulations"]}
    docs: dict[str, Document] = {}
    for d in raw["documents"]:
        if d["kind"] not in DOC_KINDS:
            raise ValueError(f"document {d['doc_id']}: unknown kind {d['kind']!r}")
        if d["reg_id"] not in regs:
            raise ValueError(f"document {d['doc_id']}: unknown regulation {d['reg_id']!r}")
        docs[d["doc_id"]] = Document(
            d["doc_id"], d["reg_id"], d["kind"], d["title"], date.fromisoformat(d["published"]),
            d["source_url"], d["verification"],
        )
    passages: dict[str, Passage] = {}
    for p in raw["passages"]:
        if p["passage_id"] in passages:
            raise ValueError(f"duplicate passage id {p['passage_id']!r}")
        doc = docs.get(p["doc_id"])
        if doc is None:
            raise ValueError(f"passage {p['passage_id']}: unknown document {p['doc_id']!r}")
        eff = _d(p.get("effective_from"))
        if doc.kind == "draft" and eff is not None:
            raise ValueError(f"passage {p['passage_id']}: drafts cannot have an effective date")
        if doc.kind != "draft" and eff is None:
            raise ValueError(f"passage {p['passage_id']}: non-draft passages need effective_from")
        if eff is not None and eff < doc.published:
            raise ValueError(f"passage {p['passage_id']}: effective before it was published")
        gf = p.get("grandfather")
        passages[p["passage_id"]] = Passage(
            passage_id=p["passage_id"],
            doc_id=p["doc_id"],
            rule_key=p["rule_key"],
            heading=p["heading"],
            text=p["text"],
            effective_from=eff,
            answer=p["answer"],
            grandfather=Grandfather(gf["situation_field"], date.fromisoformat(gf["before"]), gf["note"]) if gf else None,
            transition_note=p.get("transition_note"),
        )
    corpus = Corpus(regs, docs, passages)
    for p in passages.values():
        corpus.chains.setdefault(p.rule_key, []).append(p)
    for key, chain in corpus.chains.items():
        chain.sort(key=lambda p: (p.effective_from or date.max, docs[p.doc_id].published))
    return corpus


def load_corpus(path: Path | None = None) -> Corpus:
    path = path or DATA_DIR / "corpus.json"
    with path.open(encoding="utf-8") as f:
        return _build(json.load(f))

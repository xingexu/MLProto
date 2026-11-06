"""Question answering with three selection strategies.

baseline   top BM25 passage; ignores dates (a typical RAG pipeline)
recency    BM25 candidates published on or before the as-of date, newest wins
           (the usual "prefer recent documents" fix)
lifecycle  BM25 picks the rule, then the lifecycle resolver decides which
           version applies on the date and in the user's situation

baseline and recency always present their answer as in force, because a plain
RAG pipeline has no notion of status. That is what makes a wrong answer
"confidently stale".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum

from .corpus import Corpus, Passage
from .lifecycle import Status, passage_status, resolve
from .retrieval import Retriever


class Mode(str, Enum):
    BASELINE = "baseline"
    RECENCY = "recency"
    LIFECYCLE = "lifecycle"


@dataclass
class Citation:
    passage_id: str
    regulation: str
    regulation_title: str
    document: str
    kind: str
    published: date
    effective_from: date | None
    heading: str
    text: str
    source_url: str
    verification: str


@dataclass
class Candidate:
    passage_id: str
    document: str
    kind: str
    published: date
    effective_from: date | None
    status: Status


@dataclass
class Answer:
    mode: Mode
    question: str
    as_of: date
    status: Status
    answer: str
    citation: Citation | None
    rule_key: str | None
    true_status: Status | None = None
    previous: Citation | None = None
    upcoming: list[Citation] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    candidates: list[Candidate] = field(default_factory=list)


def _cap(text: str) -> str:
    return text[:1].upper() + text[1:]


def _fmt(d: date | None) -> str:
    return f"{d:%B} {d.day}, {d.year}" if d else "n/a"


class Engine:
    def __init__(self, corpus: Corpus):
        self.corpus = corpus
        self.retriever = Retriever(corpus)

    # -- helpers -----------------------------------------------------------
    def cite(self, p: Passage) -> Citation:
        doc, reg = self.corpus.doc_of(p), self.corpus.reg_of(p)
        return Citation(
            passage_id=p.passage_id, regulation=reg.id, regulation_title=reg.title, document=doc.title,
            kind=doc.kind, published=doc.published, effective_from=p.effective_from, heading=p.heading,
            text=p.text, source_url=doc.source_url, verification=doc.verification,
        )

    def _candidates(self, rule_key: str, as_of: date, situation: dict[str, date] | None) -> list[Candidate]:
        out = []
        for p in self.corpus.chain(rule_key):
            doc = self.corpus.doc_of(p)
            out.append(Candidate(p.passage_id, doc.title, doc.kind, doc.published, p.effective_from,
                                 passage_status(self.corpus, p, as_of, situation)))
        return out

    # -- public ------------------------------------------------------------
    def ask(self, question: str, as_of: date, mode: Mode = Mode.LIFECYCLE,
            situation: dict[str, date] | None = None, k: int = 10) -> Answer:
        hits = self.retriever.search(question, k=k)
        if not hits:
            return Answer(mode, question, as_of, Status.NONE,
                          "No matching requirement was found. Try naming the guideline or topic.", None, None)

        if mode == Mode.BASELINE:
            return self._plain(mode, question, as_of, hits[0].passage, situation)

        if mode == Mode.RECENCY:
            eligible = [h for h in hits if self.corpus.doc_of(h.passage).published <= as_of]
            if not eligible:
                return Answer(mode, question, as_of, Status.NONE,
                              f"No matching document had been published by {_fmt(as_of)}.", None, None)
            rule_key = eligible[0].passage.rule_key
            same_rule = [h.passage for h in eligible if h.passage.rule_key == rule_key]
            newest = max(same_rule, key=lambda p: (self.corpus.doc_of(p).published, p.passage_id))
            return self._plain(mode, question, as_of, newest, situation)

        return self._lifecycle(question, as_of, hits[0].passage.rule_key, situation)

    def _plain(self, mode: Mode, question: str, as_of: date, p: Passage,
               situation: dict[str, date] | None) -> Answer:
        reg = self.corpus.reg_of(p)
        return Answer(
            mode=mode, question=question, as_of=as_of, status=Status.IN_FORCE,
            answer=f"{reg.regulator} {reg.id}: {_cap(p.answer)}.",
            citation=self.cite(p), rule_key=p.rule_key,
            true_status=passage_status(self.corpus, p, as_of, situation),
            candidates=self._candidates(p.rule_key, as_of, situation),
        )

    def _lifecycle(self, question: str, as_of: date, rule_key: str,
                   situation: dict[str, date] | None) -> Answer:
        res = resolve(self.corpus, rule_key, as_of, situation)
        p = res.primary
        notes = list(res.notes)
        if p is None:
            text = f"No version of this requirement was published or in force on {_fmt(as_of)}."
        else:
            reg, doc = self.corpus.reg_of(p), self.corpus.doc_of(p)
            if res.status == Status.IN_FORCE:
                text = (f"{reg.regulator} {reg.id} on {_fmt(as_of)}: {_cap(p.answer)}. "
                        f"In force since {_fmt(p.effective_from)}.")
            elif res.status == Status.GRANDFATHERED:
                nxt = next(q for q in self.corpus.chain(rule_key)
                           if q.effective_from and p.effective_from and q.effective_from > p.effective_from
                           and not self.corpus.is_draft(q))
                text = (f"For this situation the earlier rule may still be used: {p.answer}. "
                        f"The general rule since {_fmt(nxt.effective_from)} is {nxt.answer}.")
            elif res.status == Status.NOT_YET_EFFECTIVE:
                text = (f"No version of this requirement is in force on {_fmt(as_of)}. "
                        f"The final text published {_fmt(doc.published)} says: {_cap(p.answer)}. "
                        f"It takes effect on {_fmt(p.effective_from)}.")
            else:  # DRAFT
                text = (f"Only a consultation draft exists on {_fmt(as_of)}, published {_fmt(doc.published)}. "
                        f"{_cap(p.answer)}. Drafts are not in force.")
        for u in res.upcoming:
            if u is not p:
                notes.append(f"Changing on {_fmt(u.effective_from)}: {_cap(u.answer)} "
                             f"({self.corpus.doc_of(u).title}).")
        for d in res.pending_drafts:
            notes.append(f"A draft published {_fmt(self.corpus.doc_of(d).published)} is pending. {_cap(d.answer)}.")
        return Answer(
            mode=Mode.LIFECYCLE, question=question, as_of=as_of, status=res.status, answer=text,
            citation=self.cite(p) if p else None, rule_key=rule_key,
            true_status=res.statuses.get(p.passage_id) if p else None,
            previous=self.cite(res.previous) if res.previous else None,
            upcoming=[self.cite(u) for u in res.upcoming if u is not p],
            notes=notes, candidates=self._candidates(rule_key, as_of, situation),
        )

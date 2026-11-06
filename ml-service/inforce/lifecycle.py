"""Rule lifecycle resolution: what state is each version of a rule in on a given date?

States
------
NOT_PUBLISHED      the document did not exist yet on the as-of date
DRAFT              a consultation draft; never in force
NOT_YET_EFFECTIVE  published final text whose effective date is still ahead
IN_FORCE           the version that applies on the as-of date
SUPERSEDED         replaced by a later version that is now in force
GRANDFATHERED      superseded in general, but still usable for this situation
                   (e.g. a mortgage pre-approved before the change)
NONE               no version of the rule applies on the as-of date
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum

from .corpus import Corpus, Passage


class Status(str, Enum):
    NOT_PUBLISHED = "NOT_PUBLISHED"
    DRAFT = "DRAFT"
    NOT_YET_EFFECTIVE = "NOT_YET_EFFECTIVE"
    IN_FORCE = "IN_FORCE"
    SUPERSEDED = "SUPERSEDED"
    GRANDFATHERED = "GRANDFATHERED"
    NONE = "NONE"


@dataclass
class Resolution:
    rule_key: str
    as_of: date
    status: Status
    primary: Passage | None
    statuses: dict[str, Status]
    previous: Passage | None = None
    upcoming: list[Passage] = field(default_factory=list)
    pending_drafts: list[Passage] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def _successor(corpus: Corpus, p: Passage) -> Passage | None:
    """Next non-draft version of the same rule, by effective date."""
    finals = [q for q in corpus.chain(p.rule_key) if not corpus.is_draft(q)]
    for i, q in enumerate(finals):
        if q.passage_id == p.passage_id:
            return finals[i + 1] if i + 1 < len(finals) else None
    return None


def passage_status(corpus: Corpus, p: Passage, as_of: date, situation: dict[str, date] | None = None) -> Status:
    doc = corpus.doc_of(p)
    if as_of < doc.published:
        return Status.NOT_PUBLISHED
    if doc.kind == "draft":
        return Status.DRAFT
    assert p.effective_from is not None  # enforced by the loader
    if as_of < p.effective_from:
        return Status.NOT_YET_EFFECTIVE
    nxt = _successor(corpus, p)
    if nxt is not None and nxt.effective_from is not None and as_of >= nxt.effective_from:
        gf = nxt.grandfather
        if gf and situation:
            when = situation.get(gf.situation_field)
            if when is not None and when < gf.before:
                return Status.GRANDFATHERED
        return Status.SUPERSEDED
    return Status.IN_FORCE


def resolve(corpus: Corpus, rule_key: str, as_of: date, situation: dict[str, date] | None = None) -> Resolution:
    chain = corpus.chain(rule_key)
    if not chain:
        raise KeyError(f"unknown rule {rule_key!r}")
    statuses = {p.passage_id: passage_status(corpus, p, as_of, situation) for p in chain}

    def having(s: Status) -> list[Passage]:
        return [p for p in chain if statuses[p.passage_id] == s]

    grandfathered, in_force = having(Status.GRANDFATHERED), having(Status.IN_FORCE)
    upcoming, drafts = having(Status.NOT_YET_EFFECTIVE), having(Status.DRAFT)

    res = Resolution(rule_key, as_of, Status.NONE, None, statuses, upcoming=upcoming)
    if grandfathered:
        res.status, res.primary = Status.GRANDFATHERED, grandfathered[-1]
        nxt = _successor(corpus, res.primary)
        if nxt and nxt.grandfather:
            res.notes.append(nxt.grandfather.note)
    elif in_force:
        res.status, res.primary = Status.IN_FORCE, in_force[-1]
    elif upcoming:
        res.status, res.primary = Status.NOT_YET_EFFECTIVE, upcoming[0]
    elif drafts:
        res.status, res.primary = Status.DRAFT, drafts[-1]

    if res.primary is not None and res.status in (Status.IN_FORCE, Status.GRANDFATHERED):
        finals = [p for p in chain if not corpus.is_draft(p)]
        idx = finals.index(res.primary)
        res.previous = finals[idx - 1] if idx > 0 else None
        if res.primary.transition_note and res.status == Status.IN_FORCE:
            res.notes.append(res.primary.transition_note)

    # Drafts published after the current final are proposals that may change the rule.
    latest_final_pub = max(
        (corpus.doc_of(p).published for p in chain if statuses[p.passage_id] in (Status.IN_FORCE, Status.NOT_YET_EFFECTIVE)),
        default=None,
    )
    res.pending_drafts = [
        d for d in drafts
        if res.primary is not d and (latest_final_pub is None or corpus.doc_of(d).published > latest_final_pub)
    ]
    return res

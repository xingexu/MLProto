"""Lexical retrieval (BM25) over passages.

BM25 is deliberately simple and runs offline. Swap in dense embeddings or a
hosted reranker behind the same ``search`` signature.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from rank_bm25 import BM25Okapi

from .corpus import Corpus, Passage

_STOP = set(
    "a an and are as at be been by can do does for from has have how i in is it its of on or "
    "our that the their them they this to under was were what when which who will with must "
    "should would apply applies".split()
)
_TOKEN = re.compile(r"[a-z0-9]+(?:\.[0-9]+)?")


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOP]


@dataclass(frozen=True)
class Hit:
    passage: Passage
    score: float


class Retriever:
    def __init__(self, corpus: Corpus):
        self.corpus = corpus
        self._passages = sorted(corpus.passages.values(), key=lambda p: p.passage_id)
        docs = []
        for p in self._passages:
            reg = corpus.reg_of(p)
            docs.append(tokenize(f"{reg.id} {reg.title} {reg.topic} {p.heading} {p.text}"))
        self._bm25 = BM25Okapi(docs)

    def search(self, query: str, k: int = 10) -> list[Hit]:
        tokens = tokenize(query)
        if not tokens:
            return []
        scores = self._bm25.get_scores(tokens)
        ranked = sorted(zip(self._passages, scores), key=lambda x: (-x[1], x[0].passage_id))
        return [Hit(p, float(s)) for p, s in ranked[:k] if s > 0]

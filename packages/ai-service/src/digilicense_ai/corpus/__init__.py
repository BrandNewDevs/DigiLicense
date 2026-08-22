"""Immutable, reviewed public corpus used by retrieval backends."""

from digilicense_ai.corpus.loader import CorpusError, PromotedCorpus, load_promoted_corpus
from digilicense_ai.corpus.models import CorpusManifest, CorpusSource, FactPacket

__all__ = [
    "CorpusError",
    "CorpusManifest",
    "CorpusSource",
    "FactPacket",
    "PromotedCorpus",
    "load_promoted_corpus",
]

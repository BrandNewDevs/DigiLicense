"""In-memory promotion and rollback controls for already-validated corpus releases."""

from dataclasses import dataclass

from digilicense_ai.corpus.loader import CorpusError, PromotedCorpus


@dataclass(slots=True)
class CorpusRegistry:
    """An immutable release registry; callers can switch only to validated versions."""

    releases: dict[str, PromotedCorpus]
    active_version: str

    def __post_init__(self) -> None:
        if self.active_version not in self.releases:
            raise CorpusError("active corpus release is unavailable")

    @property
    def active(self) -> PromotedCorpus:
        return self.releases[self.active_version]

    def promote(self, version: str) -> PromotedCorpus:
        if version not in self.releases:
            raise CorpusError("only an already-validated release may be promoted")
        self.active_version = version
        return self.active

    def rollback(self, version: str) -> PromotedCorpus:
        return self.promote(version)

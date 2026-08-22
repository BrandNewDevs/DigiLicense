"""Release-time corpus loading; this module deliberately has no network ingestion path."""

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from importlib.resources import files

from pydantic import ValidationError

from digilicense_ai.corpus.models import CorpusManifest, CorpusSource, ReviewStatus
from digilicense_ai.schemas import CanonicalIntent


class CorpusError(RuntimeError):
    """The approved corpus cannot safely be used for retrieval."""


@dataclass(frozen=True, slots=True)
class PromotedCorpus:
    manifest: CorpusManifest
    source_by_id: Mapping[str, CorpusSource]
    section_by_id: Mapping[str, tuple[CorpusSource, str]]

    @property
    def version(self) -> str:
        return self.manifest.corpus_version

    def allowed_source_ids(self, intent: CanonicalIntent) -> tuple[str, ...]:
        return tuple(
            source.source_id for source in self.manifest.sources if intent in source.allowed_intents
        )

    def source(self, source_id: str) -> CorpusSource:
        try:
            return self.source_by_id[source_id]
        except KeyError as error:
            raise CorpusError("source is not in the promoted corpus") from error


def load_promoted_corpus(version: str = "v1") -> PromotedCorpus:
    """Load one bundled release by version; arbitrary paths and URLs are never accepted."""

    if version != "v1":
        raise CorpusError("corpus version is not bundled for this release")
    root = files("digilicense_ai.corpus").joinpath("data", version)
    try:
        payload = json.loads(root.joinpath("manifest.json").read_text(encoding="utf-8"))
        manifest = CorpusManifest.model_validate(payload)
    except (OSError, json.JSONDecodeError, ValidationError) as error:
        raise CorpusError("bundled corpus manifest is invalid") from error
    try:
        markdown_files = {
            source.markdown_file: root.joinpath(source.markdown_file).read_bytes()
            for source in manifest.sources
        }
    except OSError as error:
        raise CorpusError("bundled reviewed Markdown is unavailable") from error
    return validate_corpus(manifest, markdown_files)


def validate_corpus(
    manifest: CorpusManifest,
    markdown_files: Mapping[str, bytes],
) -> PromotedCorpus:
    """Validate a complete in-memory corpus release deterministically for promotion."""

    source_ids = [source.source_id for source in manifest.sources]
    if len(source_ids) != len(set(source_ids)):
        raise CorpusError("duplicate source ID")
    if any(source.corpus_version != manifest.corpus_version for source in manifest.sources):
        raise CorpusError("source corpus version does not match manifest")
    if any(source.review_status is not ReviewStatus.PROMOTED for source in manifest.sources):
        raise CorpusError("unreviewed source cannot enter retrieval")

    source_by_id = {source.source_id: source for source in manifest.sources}
    section_by_id: dict[str, tuple[CorpusSource, str]] = {}
    allowlisted_urls = {str(url) for url in manifest.citation_url_allowlist}
    for source in manifest.sources:
        if str(source.public_url) not in allowlisted_urls:
            raise CorpusError("source URL is not citation allowlisted")
        content = markdown_files.get(source.markdown_file)
        if content is None:
            raise CorpusError("reviewed Markdown source is missing")
        actual_checksum = hashlib.sha256(content).hexdigest()
        if actual_checksum != source.sha256:
            raise CorpusError("reviewed Markdown checksum mismatch")
        try:
            markdown = " ".join(content.decode("utf-8").split())
        except UnicodeDecodeError as error:
            raise CorpusError("reviewed Markdown is not UTF-8") from error
        for section in source.sections:
            expected_section = " ".join((f"## {section.heading} {section.text}").split())
            if expected_section not in markdown:
                raise CorpusError("reviewed Markdown does not contain its declared section")
            if section.section_id in section_by_id:
                raise CorpusError("duplicate section ID")
            section_by_id[section.section_id] = (source, section.text)

    fact_ids: set[str] = set()
    for fact in manifest.fact_packets:
        if fact.fact_id in fact_ids:
            raise CorpusError("duplicate fact packet ID")
        fact_ids.add(fact.fact_id)
        referenced_source = source_by_id.get(fact.source_id)
        referenced_section = section_by_id.get(fact.section_id)
        if (
            referenced_source is None
            or referenced_section is None
            or referenced_section[0].source_id != fact.source_id
        ):
            raise CorpusError("fact packet does not reference a reviewed section")
        if fact.claim_kind is not referenced_source.kind:
            raise CorpusError("fact packet claim type conflicts with source")
        if not set(fact.intents).issubset(set(referenced_source.allowed_intents)):
            raise CorpusError("fact packet intent bypasses source allowlist")

    policy_intents = {
        CanonicalIntent.WAITING_PERIOD_EXPLANATION,
        CanonicalIntent.LEARNER_LICENCE_EXPIRY_EXPLANATION,
        CanonicalIntent.PREPARATION_CHECKLIST_EXPLANATION,
    }
    for intent in policy_intents:
        if not any(
            intent in source.allowed_intents and source.kind.value == "public_policy"
            for source in manifest.sources
        ):
            raise CorpusError("policy-bearing intent lacks reviewed public evidence")
    return PromotedCorpus(manifest, source_by_id, section_by_id)

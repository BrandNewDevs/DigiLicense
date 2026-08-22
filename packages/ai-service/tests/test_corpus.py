import copy
import hashlib
import json
from datetime import date, timedelta
from importlib.resources import files
from typing import Any, cast

import pytest
from pydantic import ValidationError

from digilicense_ai.corpus import CorpusError, CorpusManifest, PromotedCorpus, load_promoted_corpus
from digilicense_ai.corpus.lifecycle import CorpusRegistry
from digilicense_ai.corpus.loader import validate_corpus
from digilicense_ai.schemas import CanonicalIntent


def _payload() -> dict[str, Any]:
    root = files("digilicense_ai.corpus").joinpath("data", "v1")
    text = root.joinpath("manifest.json").read_text(encoding="utf-8")
    return cast(dict[str, Any], json.loads(text))


def _files(payload: dict[str, Any]) -> dict[str, bytes]:
    root = files("digilicense_ai.corpus").joinpath("data", "v1")
    return {
        source["markdownFile"]: root.joinpath(source["markdownFile"]).read_bytes()
        for source in payload["sources"]
    }


def _validated(payload: dict[str, Any]) -> PromotedCorpus:
    return validate_corpus(CorpusManifest.model_validate(payload), _files(payload))


def test_bundled_corpus_is_promoted_checksummed_and_complete() -> None:
    corpus = load_promoted_corpus()

    assert corpus.version == "v1"
    assert corpus.allowed_source_ids(CanonicalIntent.WAITING_PERIOD_EXPLANATION) == (
        "delhi-driving-licence-guidance-2026",
    )
    assert corpus.allowed_source_ids(CanonicalIntent.WAITLIST_EXPLANATION) == (
        "digilicense-prototype-behavior-v1",
    )
    assert all(len(source.sha256) == 64 for source in corpus.manifest.sources)


def test_duplicate_source_and_section_ids_are_rejected() -> None:
    source_duplicate = _payload()
    source_duplicate["sources"].append(copy.deepcopy(source_duplicate["sources"][0]))
    with pytest.raises(CorpusError, match="duplicate source ID"):
        _validated(source_duplicate)

    section_duplicate = _payload()
    section_duplicate["sources"][1]["sections"][0]["sectionId"] = section_duplicate["sources"][0][
        "sections"
    ][0]["sectionId"]
    with pytest.raises(CorpusError, match="duplicate section ID"):
        _validated(section_duplicate)


def test_invalid_or_missing_manifest_metadata_is_rejected() -> None:
    invalid_url = _payload()
    invalid_url["sources"][0]["publicUrl"] = "not-a-url"
    with pytest.raises(ValidationError):
        CorpusManifest.model_validate(invalid_url)

    missing_reviewer = _payload()
    del missing_reviewer["sources"][0]["reviewer"]
    with pytest.raises(ValidationError):
        CorpusManifest.model_validate(missing_reviewer)


def test_source_provenance_dates_must_be_ordered_and_not_future_dated() -> None:
    future = _payload()
    future["sources"][0]["retrievedDate"] = (date.today() + timedelta(days=1)).isoformat()
    with pytest.raises(ValidationError, match="retrieved date cannot be in the future"):
        CorpusManifest.model_validate(future)

    out_of_order = _payload()
    out_of_order["sources"][1]["publicationDate"] = "2026-08-24"
    out_of_order["sources"][1]["retrievedDate"] = "2026-08-23"
    with pytest.raises(ValidationError, match="publication date cannot be after"):
        CorpusManifest.model_validate(out_of_order)


def test_checksum_and_review_status_gate_retrieval() -> None:
    checksum = _payload()
    checksum["sources"][0]["sha256"] = "0" * 64
    with pytest.raises(CorpusError, match="checksum mismatch"):
        _validated(checksum)

    unreviewed = _payload()
    unreviewed["sources"][0]["reviewStatus"] = "reviewed"
    with pytest.raises(CorpusError, match="unreviewed source"):
        _validated(unreviewed)


def test_invalid_utf8_is_rejected_through_the_corpus_error_contract() -> None:
    payload = _payload()
    markdown = _files(payload)
    file_name = payload["sources"][0]["markdownFile"]
    markdown[file_name] = b"\xff"
    payload["sources"][0]["sha256"] = hashlib.sha256(markdown[file_name]).hexdigest()

    with pytest.raises(CorpusError, match="not UTF-8"):
        validate_corpus(CorpusManifest.model_validate(payload), markdown)


def test_url_allowlist_fact_consistency_and_claim_separation_are_enforced() -> None:
    escaped_url = _payload()
    escaped_url["sources"][0]["publicUrl"] = "https://example.invalid/not-reviewed"
    with pytest.raises(CorpusError, match="citation allowlisted"):
        _validated(escaped_url)

    fact_conflict = _payload()
    fact_conflict["factPackets"][0]["sectionId"] = "prototype-waitlist-offers-v1"
    with pytest.raises(CorpusError, match="fact packet"):
        _validated(fact_conflict)

    mixed_claim = _payload()
    mixed_claim["sources"][0]["sections"][0]["claimKind"] = "prototype_behavior"
    with pytest.raises(ValidationError, match="cannot mix"):
        CorpusManifest.model_validate(mixed_claim)


def test_policy_evidence_and_runtime_ingestion_are_both_gated() -> None:
    missing_policy = _payload()
    missing_policy["sources"][0]["allowedIntents"] = ["CURRENT_STEP_EXPLANATION"]
    missing_policy["factPackets"] = [
        fact
        for fact in missing_policy["factPackets"]
        if fact["sourceId"] != "delhi-driving-licence-guidance-2026"
    ]
    with pytest.raises(CorpusError, match="policy-bearing intent"):
        _validated(missing_policy)

    with pytest.raises(CorpusError, match="not bundled"):
        load_promoted_corpus("https://example.invalid/user-upload.md")


def test_prior_validated_release_can_be_restored() -> None:
    v1 = load_promoted_corpus()
    payload = _payload()
    payload["corpusVersion"] = "v0"
    for source in payload["sources"]:
        source["corpusVersion"] = "v0"
    v0 = _validated(payload)
    registry = CorpusRegistry(releases={"v0": v0, "v1": v1}, active_version="v1")

    assert registry.rollback("v0").version == "v0"
    with pytest.raises(CorpusError, match="already-validated"):
        registry.promote("unreviewed")


def test_checksum_fixture_is_calculated_from_the_reviewed_markdown() -> None:
    payload = _payload()
    markdown = _files(payload)
    source = payload["sources"][0]

    assert hashlib.sha256(markdown[source["markdownFile"]]).hexdigest() == source["sha256"]

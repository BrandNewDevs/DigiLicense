import pytest

from digilicense_ai.corpus import load_promoted_corpus
from digilicense_ai.fakes import FakeIntentRouter
from digilicense_ai.output_safety import (
    OutputSafetyError,
    OutputSafetyValidator,
    assert_locale_fact_equivalence,
)
from digilicense_ai.schemas import (
    AssistantMessageRequest,
    CanonicalIntent,
    CanonicalProviderRequest,
    Locale,
    Page,
    ProviderResult,
    ReasonCode,
    Service,
    Topic,
)
from digilicense_ai.schemas.retrieval import EvidenceChunk


def _request(
    intent: CanonicalIntent = CanonicalIntent.WAITING_PERIOD_EXPLANATION,
) -> CanonicalProviderRequest:
    return CanonicalProviderRequest(
        intent=intent,
        topic=Topic.PERMANENT_LICENCE_APPLICATION,
        service=Service.PERMANENT_DRIVING_LICENCE,
        page=Page.ELIGIBILITY,
        reason_code=ReasonCode.WAITING_PERIOD_ACTIVE,
        locale=Locale.ENGLISH,
        evidence=(
            EvidenceChunk(
                source_id="delhi-driving-licence-guidance-2026",
                section_id="delhi-permanent-licence-timing-v1",
                title="Reviewed Delhi guidance",
                url="https://transport.delhi.gov.in/transport/driving-license",
                text="A learner licence must be held for at least 30 days.",
                score=1,
            ),
        ),
        prompt_version="phase6-test-v1",
        corpus_version="v1",
    )


def _result(answer: str) -> ProviderResult:
    return ProviderResult(
        answer=answer,
        source_ids=("delhi-driving-licence-guidance-2026",),
        uncertain=False,
    )


def test_numeric_claim_must_match_reviewed_fact_packet() -> None:
    validator = OutputSafetyValidator(load_promoted_corpus())

    assert validator.validate(
        _result("You must wait 30 days before the competence test."), _request()
    )
    with pytest.raises(OutputSafetyError, match="numeric claim"):
        validator.validate(_result("You must wait 31 days before the competence test."), _request())


@pytest.mark.parametrize(
    "answer",
    [
        "Read [this](https://untrusted.example) guidance.",
        "<script>alert(1)</script>",
        "This is official government guidance.",
        "Visit https://untrusted.example for details.",
    ],
)
def test_markup_urls_and_affiliation_are_rejected(answer: str) -> None:
    with pytest.raises(OutputSafetyError):
        OutputSafetyValidator(load_promoted_corpus()).validate(_result(answer), _request())


def test_paired_locale_answers_preserve_numeric_facts_and_hindi_digits() -> None:
    assert_locale_fact_equivalence("Wait 30 days.", "३० दिन प्रतीक्षा करें।")
    with pytest.raises(OutputSafetyError, match="numeric facts"):
        assert_locale_fact_equivalence("Wait 30 days.", "३१ दिन प्रतीक्षा करें।")


async def test_hinglish_routing_uses_safe_text() -> None:
    router = FakeIntentRouter()
    request = AssistantMessageRequest(
        question="kitna time wait karna padega?",
        locale=Locale.ENGLISH,
        service=Service.PERMANENT_DRIVING_LICENCE,
        page=Page.ELIGIBILITY,
        reason_code=ReasonCode.NONE,
    )

    routed = await router.route(request, request.question, None)

    assert routed.intent is CanonicalIntent.WAITING_PERIOD_EXPLANATION

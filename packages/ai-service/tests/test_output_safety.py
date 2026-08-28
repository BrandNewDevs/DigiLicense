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
    ProviderFact,
    ProviderResult,
    ReasonCode,
    SemanticContext,
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
        facts=(
            ProviderFact(
                fact_id="delhi-permanent-licence-waiting-period-v1",
                source_id="delhi-driving-licence-guidance-2026",
                section_id="delhi-permanent-licence-timing-v1",
                label="Minimum learner licence holding period before competence test",
                value="30",
                unit="days",
            ),
        ),
        prompt_version="phase6-test-v1",
        corpus_version="v1",
    )


def _result(answer: str, *, fact_ids: tuple[str, ...] = ()) -> ProviderResult:
    return ProviderResult(
        answer=answer,
        source_ids=("delhi-driving-licence-guidance-2026",),
        fact_ids=fact_ids,
        uncertain=False,
    )


def _prototype_request() -> CanonicalProviderRequest:
    return CanonicalProviderRequest(
        intent=CanonicalIntent.NO_APPOINTMENT_EXPLANATION,
        topic=Topic.WAITLIST,
        service=Service.APPOINTMENT_WAITLIST,
        page=Page.APPOINTMENT_WAITLIST,
        reason_code=ReasonCode.NO_MATCHING_SLOT,
        locale=Locale.ENGLISH,
        evidence=(
            EvidenceChunk(
                source_id="digilicense-prototype-behavior-v1",
                section_id="prototype-waitlist-offers-v1",
                title="DigiLicense behavior and service boundaries",
                url="https://digilicense.invalid/prototype/assistant-behavior",
                text="Appointment reservation is simulated workflow behavior.",
                score=1,
            ),
        ),
        facts=(
            ProviderFact(
                fact_id="prototype-appointment-reservation-v1",
                source_id="digilicense-prototype-behavior-v1",
                section_id="prototype-waitlist-offers-v1",
                label="Appointment reservation status",
                value="simulated",
                unit="workflow",
            ),
        ),
        prompt_version="phase6-test-v1",
        corpus_version="v1",
    )


def test_numeric_claim_must_match_reviewed_fact_packet() -> None:
    validator = OutputSafetyValidator(load_promoted_corpus())
    fact_ids = ("delhi-permanent-licence-waiting-period-v1",)

    assert validator.validate(
        _result("You must wait 30 days before the competence test.", fact_ids=fact_ids), _request()
    )
    with pytest.raises(OutputSafetyError, match="numeric claim"):
        validator.validate(
            _result("You must wait 31 days before the competence test.", fact_ids=fact_ids),
            _request(),
        )
    with pytest.raises(OutputSafetyError, match="numeric claim"):
        validator.validate(
            _result("You must wait 30 months before the competence test.", fact_ids=fact_ids),
            _request(),
        )
    with pytest.raises(OutputSafetyError, match="numeric claim"):
        validator.validate(
            _result("You must wait seven days before the competence test.", fact_ids=fact_ids),
            _request(),
        )
    assert validator.validate(
        _result("You must wait thirty days before the competence test.", fact_ids=fact_ids),
        _request(),
    )
    with pytest.raises(OutputSafetyError, match="numeric claim"):
        validator.validate(
            _result("You must wait twenty-one days before the competence test.", fact_ids=fact_ids),
            _request(),
        )
    with pytest.raises(OutputSafetyError, match="unsupported spelled"):
        validator.validate(
            _result(
                "You must wait one hundred days before the competence test.", fact_ids=fact_ids
            ),
            _request(),
        )
    for answer in ("You must wait half a year.", "You must wait a year and a half."):
        with pytest.raises(OutputSafetyError, match="unsupported spelled"):
            validator.validate(_result(answer, fact_ids=fact_ids), _request())
    with pytest.raises(OutputSafetyError, match="numeric claim"):
        validator.validate(
            _result("आपको बीस दिन प्रतीक्षा करनी होगी।", fact_ids=fact_ids),
            _request(),
        )
    assert validator.validate(
        _result("आपको तीस दिन प्रतीक्षा करनी होगी।", fact_ids=fact_ids),
        _request(),
    )
    with pytest.raises(OutputSafetyError, match="unsupported Hindi"):
        validator.validate(
            _result("आपको आधा साल प्रतीक्षा करनी होगी।", fact_ids=fact_ids),
            _request(),
        )
    assert validator.validate(_result("तीसरा चरण पूरा करें।"), _request())
    assert validator.validate(_result("इस साल निर्देश बदल सकते हैं।"), _request())


@pytest.mark.parametrize(
    "answer",
    [
        "Read [this](https://untrusted.example) guidance.",
        "**Wait 30 days** before applying.",
        "`Wait 30 days` before applying.",
        "<script>alert(1)</script>",
        "This is official government guidance.",
        "DigiLicense is a government-run portal.",
        "Use the government portal for this service.",
        "Visit the external website for the next step.",
        "This government website explains the process.",
        "The service is run by the government.",
        "DigiLicense is the official Delhi Transport Department service; wait 30 days.",
        "DigiLicense एक सरकारी पोर्टल है।",
        "यह सेवा सरकार द्वारा संचालित है।",
        "Visit https://untrusted.example for details.",
        "Use ftp://untrusted.example instead.",
    ],
)
def test_markup_urls_and_affiliation_are_rejected(answer: str) -> None:
    with pytest.raises(OutputSafetyError):
        OutputSafetyValidator(load_promoted_corpus()).validate(_result(answer), _request())


def test_paired_locale_answers_preserve_numeric_facts_and_hindi_digits() -> None:
    assert_locale_fact_equivalence("Wait 30 days.", "३० दिन प्रतीक्षा करें।")
    with pytest.raises(OutputSafetyError, match="numeric facts"):
        assert_locale_fact_equivalence("Wait 30 days.", "३१ दिन प्रतीक्षा करें।")


def test_numeric_answers_require_fact_ids_and_matching_units() -> None:
    validator = OutputSafetyValidator(load_promoted_corpus())
    with pytest.raises(OutputSafetyError, match="omits reviewed fact IDs"):
        validator.validate(_result("You must wait 30 days."), _request())
    with pytest.raises(OutputSafetyError, match="without using"):
        validator.validate(
            _result(
                "Use the reviewed guidance.",
                fact_ids=("delhi-permanent-licence-waiting-period-v1",),
            ),
            _request(),
        )


def test_reviewed_text_fact_requires_its_exact_value_and_unit() -> None:
    validator = OutputSafetyValidator(load_promoted_corpus())
    request = _prototype_request()
    result = ProviderResult(
        answer="Appointment reservation is simulated workflow behavior.",
        source_ids=("digilicense-prototype-behavior-v1",),
        fact_ids=("prototype-appointment-reservation-v1",),
        uncertain=False,
    )

    assert validator.validate(result, request)
    with pytest.raises(OutputSafetyError, match="without using"):
        validator.validate(
            result.model_copy(update={"answer": "This is simulated prototype behavior."}),
            request,
        )


def test_hindi_numeric_answer_requires_the_same_reviewed_fact() -> None:
    validator = OutputSafetyValidator(load_promoted_corpus())
    hindi_request = _request().model_copy(update={"locale": Locale.HINDI})

    assert validator.validate(
        _result(
            "आपको competence test से पहले ३० दिन प्रतीक्षा करनी होगी।",
            fact_ids=("delhi-permanent-licence-waiting-period-v1",),
        ),
        hindi_request,
    )


def test_independent_prototype_disclosure_is_not_misclassified_as_affiliation() -> None:
    assert OutputSafetyValidator(load_promoted_corpus()).validate(
        _result("DigiLicense is not an official government service."), _request()
    )


def test_numeric_fact_order_and_multiplicity_are_preserved() -> None:
    with pytest.raises(OutputSafetyError, match="numeric facts"):
        assert_locale_fact_equivalence(
            "Dates: 01/02/2026 and 01/02/2026.", "तिथियां: 02/01/2026 और 01/02/2026।"
        )


def test_citations_must_be_retrieved_and_known() -> None:
    validator = OutputSafetyValidator(load_promoted_corpus())
    missing_from_evidence = _result("Use the reviewed guidance.").model_copy(
        update={"source_ids": ("another-reviewed-source",)}
    )
    with pytest.raises(OutputSafetyError, match="outside retrieved evidence"):
        validator.validate(missing_from_evidence, _request())

    unknown = _result("Use the reviewed guidance.").model_copy(
        update={"source_ids": ("unknown-reviewed-source",)}
    )
    unknown_evidence = (
        _request().evidence[0].model_copy(update={"source_id": "unknown-reviewed-source"})
    )
    with pytest.raises(OutputSafetyError, match="unknown source"):
        validator.validate(unknown, _request().model_copy(update={"evidence": (unknown_evidence,)}))


def test_fact_ids_must_be_supplied_for_the_exact_retrieved_section() -> None:
    with pytest.raises(OutputSafetyError, match="outside retrieved evidence"):
        OutputSafetyValidator(load_promoted_corpus()).validate(
            _result(
                "The learner licence is valid for 6 months.",
                fact_ids=("delhi-learner-validity-six-months-v1",),
            ),
            _request(),
        )


def test_fact_citation_must_name_its_source_when_multiple_sections_are_retrieved() -> None:
    request = _request().model_copy(
        update={
            "intent": CanonicalIntent.CURRENT_STEP_EXPLANATION,
            "evidence": (
                _request()
                .evidence[0]
                .model_copy(update={"section_id": "delhi-ll-validity-preparation-v1"}),
                _request()
                .evidence[0]
                .model_copy(
                    update={
                        "source_id": "delhi-permanent-driving-licence-fee-2026",
                        "section_id": "delhi-permanent-licence-fee-v1",
                    }
                ),
            ),
            "facts": (
                ProviderFact(
                    fact_id="delhi-permanent-licence-fee-400-inr-v1",
                    source_id="delhi-permanent-driving-licence-fee-2026",
                    section_id="delhi-permanent-licence-fee-v1",
                    label="Permanent driving-licence revised fee",
                    value="400",
                    unit="INR",
                ),
            ),
        }
    )
    result = ProviderResult(
        answer="The reviewed fee is 400 INR.",
        source_ids=("delhi-driving-licence-guidance-2026",),
        fact_ids=("delhi-permanent-licence-fee-400-inr-v1",),
        uncertain=False,
    )

    with pytest.raises(OutputSafetyError, match="outside its cited source"):
        OutputSafetyValidator(load_promoted_corpus()).validate(result, request)


async def test_waitlist_routing_precedes_generic_waiting_term() -> None:
    router = FakeIntentRouter()
    request = AssistantMessageRequest(
        question="How do I join the waitlist?",
        locale=Locale.ENGLISH,
        service=Service.APPOINTMENT_WAITLIST,
        page=Page.APPOINTMENT_WAITLIST,
        reason_code=ReasonCode.NONE,
    )

    routed = await router.route(request, request.question, None)

    assert routed.intent is CanonicalIntent.WAITLIST_EXPLANATION


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


async def test_referential_follow_up_uses_signed_semantic_context() -> None:
    router = FakeIntentRouter()
    request = AssistantMessageRequest(
        question="How long will it take after that?",
        locale=Locale.ENGLISH,
        service=Service.PERMANENT_DRIVING_LICENCE,
        page=Page.ASSISTANT,
        reason_code=ReasonCode.NONE,
    )
    context = SemanticContext(
        last_intent=CanonicalIntent.WAITLIST_EXPLANATION,
        topic=Topic.WAITLIST,
        locale=Locale.ENGLISH,
        iat=1,
        exp=2,
        keyId="test",
    )

    routed = await router.route(request, request.question, context)

    assert routed.intent is CanonicalIntent.WAITLIST_EXPLANATION
    assert routed.topic is Topic.WAITLIST


async def test_explicit_intent_overrides_referential_context() -> None:
    router = FakeIntentRouter()
    request = AssistantMessageRequest(
        question="Is this offer expired?",
        locale=Locale.ENGLISH,
        service=Service.APPOINTMENT_WAITLIST,
        page=Page.ASSISTANT,
        reason_code=ReasonCode.NONE,
    )
    context = SemanticContext(
        last_intent=CanonicalIntent.WAITLIST_EXPLANATION,
        topic=Topic.WAITLIST,
        locale=Locale.ENGLISH,
        iat=1,
        exp=2,
        keyId="test",
    )

    routed = await router.route(request, request.question, context)

    assert routed.intent is CanonicalIntent.OFFER_EXPIRY_EXPLANATION


@pytest.mark.parametrize(
    "question",
    [
        "Tell me my medical diagnosis.",
        "How do I apply in Mumbai?",
        "How do I apply in Pune?",
    ],
)
async def test_out_of_scope_and_wrong_jurisdiction_questions_are_rejected(question: str) -> None:
    router = FakeIntentRouter()
    request = AssistantMessageRequest(
        question=question,
        locale=Locale.ENGLISH,
        service=Service.PERMANENT_DRIVING_LICENCE,
        page=Page.ASSISTANT,
        reason_code=ReasonCode.NONE,
    )

    routed = await router.route(request, request.question, None)

    assert routed.intent is CanonicalIntent.UNSUPPORTED_QUESTION

"""Shared canonical payload and output-validation rules for provider adapters."""

import json
from typing import Protocol

from digilicense_ai.schemas import CanonicalIntent, CanonicalProviderRequest, Locale, ProviderResult

INSTRUCTIONS = """You are the DigiLicense workflow explanation provider.
Your entire scope is the independent DigiLicense prototype and the ten workflows listed below.
Use only the supplied reviewed DigiLicense evidence and workflow map. Do not answer general or
real-world questions, infer public policy or legal requirements, inspect identity, perform actions,
or claim government affiliation. Keep every direction inside DigiLicense. Never name, link to, or
direct a person to a government, official, or other external website, portal, or service. Do not
include URLs. When a request cannot be answered from the supplied DigiLicense evidence, briefly
state that it is outside DigiLicense guidance and set uncertain true; do not fill gaps from model
knowledge. Answer in the requested locale. Every sourceId must exactly match a supplied evidence
sourceId. For every date, duration, fee, or other numeric claim, include its exact reviewed factId
and preserve the fact's value and unit. For any other factId, include both its reviewed value and
unit in the answer, though they do not need to be adjacent.

DigiLicense workflow map:
- Learner's licence: start the learner's licence form, submit it, complete the fee step, then take
  the learner's test when the application shows that action.
- Learner's test: review the preparation checklist, take the test, then read the recorded result.
  A passed learner application shows its permanent-licence eligibility date.
- Permanent driving licence: wait until the eligibility date, submit the permanent-licence form,
  complete the fee step, then choose driving-test appointment preferences.
- Appointment waitlist: save zone and delivery preferences, remain on the waitlist until an offer
  appears, then accept or reject it before its displayed expiry. A confirmed appointment is shown
  in the appointment service.
- Renewal: open the renewal form, complete its displayed steps, then check its DigiLicense status.
- Duplicate or replacement: open that form, complete its displayed steps, then check its status.
- Address change: complete the displayed verification, proof, review, and status steps.
- Mobile update: complete its displayed verification; any Aadhaar option is mock and local only.
- Application status: use the dashboard and status service for DigiLicense records only.
- Fees and payment: use the displayed fee step; payment results exist only inside DigiLicense.
Explain what the current page, service, and reason code mean. Only suggest a next action that exists
in this workflow map or is already shown in DigiLicense.
Return only the required structured response."""

_LOCALE_INSTRUCTIONS = {
    Locale.ENGLISH: (
        "Write plain English. Preserve every date, number, waiting period, fee, uncertainty, "
        "and simulation disclosure from the evidence."
    ),
    Locale.HINDI: (
        "हिंदी में सरल उत्तर लिखें। प्रमाण में दिए हर दिनांक, संख्या, प्रतीक्षा अवधि, शुल्क, "
        "अनिश्चितता और सिमुलेशन सूचना को सुरक्षित रखें। licence और learner licence जैसे "
        "सेवा-शब्दों को स्पष्ट रखें।"
    ),
}


def localized_instructions(locale: Locale) -> str:
    return f"{INSTRUCTIONS}\n{_LOCALE_INSTRUCTIONS[locale]}"


class ProviderResponse(Protocol):
    output_text: str
    status: str


def canonical_input(request: CanonicalProviderRequest) -> str:
    """Serialize provider-safe workflow evidence without source URLs or raw questions."""

    payload = request.public_dump()
    payload["evidence"] = [
        {key: value for key, value in evidence.items() if key != "url"}
        for evidence in payload["evidence"]
    ]
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def validated_result(
    response: ProviderResponse,
    request: CanonicalProviderRequest,
) -> ProviderResult:
    """Reject malformed, ungrounded, or duplicate provider citations."""

    if response.status != "completed" or not response.output_text:
        raise ValueError("provider response did not complete")

    result = ProviderResult.model_validate_json(response.output_text)
    allowed_source_ids = {chunk.source_id for chunk in request.evidence}
    returned_source_ids = set(result.source_ids)
    if len(returned_source_ids) != len(result.source_ids):
        raise ValueError("provider returned duplicate source IDs")
    if not returned_source_ids.issubset(allowed_source_ids):
        raise ValueError("provider returned a source ID outside supplied evidence")
    if request.intent is not CanonicalIntent.UNSUPPORTED_QUESTION and not returned_source_ids:
        raise ValueError("grounded provider response omitted its source")
    allowed_fact_ids = {fact.fact_id for fact in request.facts}
    if len(set(result.fact_ids)) != len(result.fact_ids):
        raise ValueError("provider returned duplicate fact IDs")
    if not set(result.fact_ids).issubset(allowed_fact_ids):
        raise ValueError("provider returned a fact ID outside supplied evidence")
    return result

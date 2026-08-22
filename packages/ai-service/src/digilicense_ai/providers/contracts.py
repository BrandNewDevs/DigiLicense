"""Shared canonical payload and output-validation rules for provider adapters."""

import json
from typing import Protocol

from digilicense_ai.schemas import CanonicalIntent, CanonicalProviderRequest, ProviderResult

INSTRUCTIONS = """You are the DigiLicense public-guidance explanation provider.
Use only the supplied reviewed public evidence. Do not infer eligibility, inspect identity,
perform actions, or claim government affiliation. Answer in the requested locale. Every sourceId
must exactly match a supplied evidence sourceId. If evidence is insufficient, set uncertain true.
Return only the required structured response."""


class ProviderResponse(Protocol):
    output_text: str
    status: str


def canonical_input(request: CanonicalProviderRequest) -> str:
    """Serialize only the canonical public contract; raw text is unavailable by design."""

    return json.dumps(request.public_dump(), ensure_ascii=False, separators=(",", ":"))


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
    return result

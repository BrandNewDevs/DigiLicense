import pytest

from digilicense_ai.dlp import LocalDlpGateway
from digilicense_ai.schemas import DlpAction


@pytest.mark.parametrize(
    ("text", "entity_type"),
    [
        ("My Aadhaar is 2345 6789 0124", "AADHAAR_NUMBER"),
        ("मेरा आधार २३४५-६७८९-०१२४ है", "AADHAAR_NUMBER"),
        ("PAN abcde1234f", "PAN_NUMBER"),
        ("PAN A B C D E 1 2 3 4 F", "PAN_NUMBER"),
        ("Call +91 98765-43210", "INDIAN_MOBILE_NUMBER"),
        ("OTP is 654321", "OTP"),
        ("OTP is 1 2 3 4 5 6", "OTP"),
        ("OTP is 1-2-3-4-5-6", "OTP"),
        ("मेरा ओटीपी 654321 है", "OTP"),
        ("mera verification code 654321 hai", "OTP"),
        ("licence DL-04-2024-1234567", "DRIVING_LICENCE_NUMBER"),
        ("learner licence LL/DL/2024/123456", "LEARNER_LICENCE_NUMBER"),
        ("application number APP/2024/123456", "APPLICATION_REFERENCE"),
        ("receipt number RCP-12345678", "RECEIPT_REFERENCE"),
        ("UPI test.user@okbank", "UPI_ID"),
        ("UPI test.user @ okbank", "UPI_ID"),
        ("IFSC TEST0123456", "IFSC_CODE"),
        ("account number 123456789012", "BANK_ACCOUNT_NUMBER"),
        ("passport A2345678", "INDIAN_PASSPORT_NUMBER"),
        ("voter ID ABC1234567", "VOTER_ID"),
        ("vehicle DL 8C AB 1234", "VEHICLE_REGISTRATION"),
        ("email synthetic.user@example.org", "EMAIL_ADDRESS"),
        ("email synthetic.user @ example.org", "EMAIL_ADDRESS"),
    ],
)
async def test_structured_identifiers_are_blocked(
    local_dlp_gateway: LocalDlpGateway,
    text: str,
    entity_type: str,
) -> None:
    result = await local_dlp_gateway.analyze(text)

    assert result.action is DlpAction.BLOCK_PROVIDER_WITH_LOCAL_HELP
    assert entity_type in result.entity_types
    assert result.provider_allowed is False
    assert result.entities
    assert text not in result.safe_routing_text


async def test_invalid_aadhaar_checksum_is_not_classified_as_aadhaar(
    local_dlp_gateway: LocalDlpGateway,
) -> None:
    result = await local_dlp_gateway.analyze("number 2345 6789 0123")

    assert "AADHAAR_NUMBER" not in result.entity_types


@pytest.mark.parametrize(
    "text",
    [
        "My name is Rahul Sharma. How do I renew?",
        "mera naam Rahul Sharma hai, renewal kaise hoga?",
        "मेरा नाम राहुल शर्मा है। लाइसेंस कैसे बनेगा?",
    ],
)
async def test_names_with_disclosure_cues_are_blocked(
    local_dlp_gateway: LocalDlpGateway,
    text: str,
) -> None:
    result = await local_dlp_gateway.analyze(text)

    assert "PERSON_NAME" in result.entity_types
    assert "Rahul" not in result.safe_routing_text
    assert "राहुल" not in result.safe_routing_text


@pytest.mark.parametrize(
    "text",
    [
        "My address is 12 Test Lane, Delhi?",
        "mera pata 12 Test Lane Delhi hai?",
        "मेरा पता 12 टेस्ट लेन दिल्ली है?",
    ],
)
async def test_addresses_with_disclosure_cues_are_blocked(
    local_dlp_gateway: LocalDlpGateway,
    text: str,
) -> None:
    result = await local_dlp_gateway.analyze(text)

    assert "PERSONAL_ADDRESS" in result.entity_types
    assert result.provider_allowed is False


@pytest.mark.parametrize(
    "text",
    [
        "How do I apply for a driving licence in Delhi?",
        "Is the Delhi appointment centre open?",
        "I have waited 30 days.",
        "Can I apply after 12 March 2026?",
        "The learner licence waiting period is 30 days.",
        "What documents are accepted?",
        "Why is appointment booking unavailable?",
        "Explain the public fee schedule.",
        "How long does renewal take?",
        "Where can applicants read the checklist?",
        "Does the prototype save application data?",
        "What happens when an offer expires?",
        "Can a user join the waitlist?",
        "Please explain learner licence eligibility.",
        "Is online payment simulated?",
        "Why is my action locked?",
        "What is a permanent driving licence?",
        "When can I take the learner test?",
        "Show general guidance for address changes.",
        "Does Delhi support this service?",
    ],
)
async def test_benign_corpus_false_positive_rate_is_below_five_percent(
    local_dlp_gateway: LocalDlpGateway,
    text: str,
) -> None:
    result = await local_dlp_gateway.analyze(text)

    assert result.action is DlpAction.ALLOW

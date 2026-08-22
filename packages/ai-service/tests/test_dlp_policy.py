import pytest

from digilicense_ai.dlp.policy import load_dlp_policy
from digilicense_ai.dlp.recognizers import (
    IndiaStructuredRecognizer,
    MultilingualDisclosureRecognizer,
    build_recognizer_registry,
)


def test_versioned_policy_loads_multilingual_cues() -> None:
    policy = load_dlp_policy("v1")

    assert policy.version == "1.0.0"
    assert "my name is" in policy.name_cues
    assert "mera naam" in policy.name_cues
    assert "मेरा नाम" in policy.name_cues
    assert "मेरा पता" in policy.address_cues


def test_invalid_policy_identifier_cannot_select_arbitrary_resource() -> None:
    with pytest.raises(ValueError, match="invalid DLP policy identifier"):
        load_dlp_policy("../private")


def test_custom_recognizers_are_registered_with_presidio() -> None:
    registry = build_recognizer_registry(load_dlp_policy())
    recognizers = registry.get_recognizers(language="en", all_fields=True)

    assert any(isinstance(item, IndiaStructuredRecognizer) for item in recognizers)
    assert any(isinstance(item, MultilingualDisclosureRecognizer) for item in recognizers)

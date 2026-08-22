"""Unicode normalization and obfuscation detection for untrusted text."""

import base64
import binascii
import html
import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import unquote

_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_DASH_CHARACTERS = str.maketrans(
    {
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2015": "-",
        "\u2212": "-",
    }
)
_BIDI_CONTROLS = frozenset(
    {
        "\u061c",
        "\u200e",
        "\u200f",
        "\u202a",
        "\u202b",
        "\u202c",
        "\u202d",
        "\u202e",
        "\u2066",
        "\u2067",
        "\u2068",
        "\u2069",
    }
)
_INVISIBLE_CHARACTERS = frozenset(
    {
        "\u00ad",
        "\u200b",
        "\u200c",
        "\u200d",
        "\u2060",
        "\ufeff",
    }
)
_ENCODED_KEYWORDS = (
    "ignore previous",
    "ignore all",
    "system prompt",
    "developer message",
    "hidden instruction",
    "jailbreak",
)
_BASE64_TOKEN = re.compile(r"(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{24,}={0,2}(?![A-Za-z0-9+/])")
_PERCENT_ENCODED = re.compile(r"(?:%[0-9A-Fa-f]{2}){6,}")
_HEX_ESCAPED = re.compile(r"(?:\\x[0-9A-Fa-f]{2}){6,}")


@dataclass(frozen=True, slots=True)
class NormalizedText:
    text: str
    has_invisible_obfuscation: bool
    has_unsafe_bidi: bool
    has_suspicious_encoding: bool


def normalize_untrusted_text(value: str) -> NormalizedText:
    """Normalize detection variants without retaining an original-to-normalized map."""

    normalized = unicodedata.normalize("NFKC", value).translate(_DEVANAGARI_DIGITS)
    normalized = normalized.translate(_DASH_CHARACTERS)

    has_unsafe_bidi = any(character in _BIDI_CONTROLS for character in normalized)
    has_invisible_obfuscation = _contains_invisible_obfuscation(normalized)
    normalized = "".join(
        character
        for character in normalized
        if character not in _BIDI_CONTROLS and not _is_invisible_control(character)
    )
    normalized = "".join(
        " " if character.isspace() or unicodedata.category(character) == "Zs" else character
        for character in normalized
    )
    normalized = re.sub(r" +", " ", normalized).strip()

    return NormalizedText(
        text=normalized,
        has_invisible_obfuscation=has_invisible_obfuscation,
        has_unsafe_bidi=has_unsafe_bidi,
        has_suspicious_encoding=_contains_suspicious_encoding(normalized),
    )


def _contains_invisible_obfuscation(value: str) -> bool:
    for index, character in enumerate(value):
        if not _is_invisible_control(character):
            continue
        previous = value[index - 1] if index else ""
        following = value[index + 1] if index + 1 < len(value) else ""
        if previous.isalnum() and following.isalnum():
            return True
        if character not in {"\u200c", "\u200d"}:
            return True
    return False


def _is_invisible_control(character: str) -> bool:
    if character in _BIDI_CONTROLS:
        return False
    if character in _INVISIBLE_CHARACTERS:
        return True
    category = unicodedata.category(character)
    return category == "Cf" or (category == "Cc" and not character.isspace())


def _contains_suspicious_encoding(value: str) -> bool:
    candidates: list[str] = []
    candidates.extend(unquote(match.group()) for match in _PERCENT_ENCODED.finditer(value))
    candidates.extend(
        bytes.fromhex(match.group().replace("\\x", "")).decode("utf-8", errors="ignore")
        for match in _HEX_ESCAPED.finditer(value)
    )
    html_decoded = html.unescape(value)
    if html_decoded != value:
        candidates.append(html_decoded)

    for match in _BASE64_TOKEN.finditer(value):
        token = match.group()
        try:
            padding = "=" * (-len(token) % 4)
            decoded = base64.b64decode(token + padding, validate=True).decode(
                "utf-8", errors="ignore"
            )
        except (binascii.Error, UnicodeDecodeError, ValueError):
            continue
        candidates.append(decoded)

    return any(
        keyword in candidate.casefold() for candidate in candidates for keyword in _ENCODED_KEYWORDS
    )

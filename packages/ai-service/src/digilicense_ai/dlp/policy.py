"""Validated loader for versioned multilingual DLP policy data."""

import json
import re
from importlib.resources import files

from pydantic import BaseModel, ConfigDict, Field

POLICY_RESOURCE_PACKAGE = "digilicense_ai.dlp.policies"
DEFAULT_POLICY_ID = "v1"


class DlpPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    name_cues: tuple[str, ...] = Field(min_length=1)
    name_terminators: tuple[str, ...] = Field(min_length=1)
    address_cues: tuple[str, ...] = Field(min_length=1)
    address_terminators: tuple[str, ...] = Field(min_length=1)

    def name_cue_pattern(self) -> re.Pattern[str]:
        return _compile_phrases(self.name_cues)

    def address_cue_pattern(self) -> re.Pattern[str]:
        return _compile_phrases(self.address_cues)


def load_dlp_policy(policy_id: str = DEFAULT_POLICY_ID) -> DlpPolicy:
    if not re.fullmatch(r"v[1-9]\d*", policy_id):
        raise ValueError("invalid DLP policy identifier")

    resource = files(POLICY_RESOURCE_PACKAGE).joinpath(f"{policy_id}.json")
    payload = json.loads(resource.read_text(encoding="utf-8"))
    return DlpPolicy.model_validate(payload)


def phrase_alternation(phrases: tuple[str, ...]) -> str:
    return "|".join(_phrase_expression(phrase) for phrase in phrases)


def _compile_phrases(phrases: tuple[str, ...]) -> re.Pattern[str]:
    return re.compile(f"(?:{phrase_alternation(phrases)})", re.IGNORECASE)


def _phrase_expression(phrase: str) -> str:
    tokens = phrase.split()
    if not tokens:
        raise ValueError("DLP policy phrases must not be blank")
    expression = r"\s+".join(re.escape(token) for token in tokens)
    if phrase.isascii():
        return rf"\b{expression}\b"
    return expression

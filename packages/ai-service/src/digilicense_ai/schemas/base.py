"""Shared strict model configuration."""

from typing import Any

from pydantic import BaseModel, ConfigDict


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ContractModel(BaseModel):
    """Immutable contract that rejects fields outside its declared schema."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
        frozen=True,
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    def public_dump(self) -> dict[str, Any]:
        return self.model_dump(mode="json", by_alias=True)

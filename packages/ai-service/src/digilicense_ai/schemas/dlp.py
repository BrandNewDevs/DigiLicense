"""DLP boundary contracts."""

from pydantic import Field, model_validator

from digilicense_ai.schemas.base import ContractModel
from digilicense_ai.schemas.enums import DlpAction, DlpScope


class DlpEntity(ContractModel):
    entity_type: str
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    score: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def span_must_be_nonempty(self) -> "DlpEntity":
        if self.end <= self.start:
            raise ValueError("DLP entity span must be nonempty")
        return self


class DlpResult(ContractModel):
    action: DlpAction
    scope: DlpScope = DlpScope.INBOUND
    entities: tuple[DlpEntity, ...] = ()
    entity_types: tuple[str, ...] = ()
    safe_routing_text: str
    provider_allowed: bool

    @model_validator(mode="after")
    def action_matches_provider_permission(self) -> "DlpResult":
        expected = self.action is DlpAction.ALLOW
        if self.provider_allowed is not expected:
            raise ValueError("provider permission does not match DLP action")
        return self

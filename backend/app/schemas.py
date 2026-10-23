from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PartyContext(StrictModel):
    name: str = Field(max_length=300)
    title: str = Field(max_length=300)
    company: str = Field(max_length=300)
    noticeAddress: str = Field(max_length=1000)


class CurrentData(StrictModel):
    purpose: str = Field(max_length=2000)
    effectiveDate: str = Field(max_length=10)
    mndaTermType: Literal["expires", "continues"]
    mndaTermYears: int = Field(ge=1, le=100)
    confidentialityType: Literal["years", "perpetuity"]
    confidentialityYears: int = Field(ge=1, le=100)
    governingLaw: str = Field(max_length=300)
    jurisdiction: str = Field(max_length=500)
    party1: PartyContext
    party2: PartyContext

    @field_validator("effectiveDate")
    @classmethod
    def valid_iso_date(cls, value: str) -> str:
        if value and (len(value) != 10 or date.fromisoformat(value).isoformat() != value):
            raise ValueError("Use YYYY-MM-DD.")
        return value


class ChatMessage(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(StrictModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(max_length=12)
    currentData: CurrentData


class PartyPatch(StrictModel):
    name: str | None
    title: str | None
    company: str | None
    noticeAddress: str | None


class NdaPatch(StrictModel):
    purpose: str | None
    effectiveDate: str | None
    mndaTermType: Literal["expires", "continues"] | None
    mndaTermYears: int | None = Field(ge=1, le=100)
    confidentialityType: Literal["years", "perpetuity"] | None
    confidentialityYears: int | None = Field(ge=1, le=100)
    governingLaw: str | None
    jurisdiction: str | None
    party1: PartyPatch | None
    party2: PartyPatch | None

    @field_validator("effectiveDate")
    @classmethod
    def valid_iso_date(cls, value: str | None) -> str | None:
        if value and (len(value) != 10 or date.fromisoformat(value).isoformat() != value):
            raise ValueError("Use YYYY-MM-DD.")
        return value


class ChatResponse(StrictModel):
    reply: str = Field(min_length=1, max_length=2000)
    updates: NdaPatch

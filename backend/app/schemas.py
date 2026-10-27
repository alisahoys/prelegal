from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.catalog import catalog_by_id, template_fields


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class AuthRequest(StrictModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().casefold()


class UserResponse(StrictModel):
    id: int
    email: EmailStr


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


class FieldContext(StrictModel):
    field: str = Field(min_length=1, max_length=200)
    value: str = Field(max_length=2000)


class FieldUpdate(StrictModel):
    field: str = Field(min_length=1, max_length=200)
    value: str = Field(max_length=2000)


class ChatRequest(StrictModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(max_length=12)
    currentTemplateId: str
    currentData: CurrentData | None
    currentFields: list[FieldContext] = Field(max_length=100)

    @model_validator(mode="after")
    def fields_match_template(self):
        entry = catalog_by_id().get(self.currentTemplateId)
        if entry is None:
            raise ValueError("Unknown template ID.")
        allowed = set(template_fields(entry.filename))
        fields = [item.field for item in self.currentFields]
        if len(fields) != len(set(fields)) or not set(fields).issubset(allowed):
            raise ValueError("Field context must match selected template variables.")
        if entry.editor == "nda":
            if self.currentData is None or self.currentFields:
                raise ValueError("NDA data must match the selected template workflow.")
        elif self.currentData is not None or fields != template_fields(entry.filename):
            raise ValueError("Field context must include selected template variables in source order.")
        return self


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


class SavedDocumentState(StrictModel):
    templateId: str
    ndaData: dict[str, Any] | None
    fields: dict[str, str]

    @model_validator(mode="after")
    def validate_template_state(self):
        entry = catalog_by_id().get(self.templateId)
        if entry is None:
            raise ValueError("Unknown template ID.")
        if entry.editor == "nda":
            if self.ndaData is None or self.fields:
                raise ValueError("NDA data must match the selected template workflow.")
            allowed = {"purpose", "effectiveDate", "mndaTermType", "mndaTermYears", "confidentialityType", "confidentialityYears", "governingLaw", "jurisdiction", "modifications", "party1", "party2"}
            if set(self.ndaData) != allowed:
                raise ValueError("NDA state must include all editable fields.")
            NdaDraft.model_validate(self.ndaData)
        else:
            if self.ndaData is not None:
                raise ValueError("Template field state must match the selected template workflow.")
            entry_fields = set(template_fields(entry.filename))
            if not set(self.fields).issubset(entry_fields):
                raise ValueError("Template fields must match the selected template.")
            if any(len(value) > 2000 for value in self.fields.values()):
                raise ValueError("Template field values are too long.")
        return self


class NdaDraft(StrictModel):
    purpose: str = Field(max_length=2000)
    effectiveDate: str = Field(max_length=10)
    mndaTermType: Literal["expires", "continues"]
    mndaTermYears: int = Field(ge=1, le=100)
    confidentialityType: Literal["years", "perpetuity"]
    confidentialityYears: int = Field(ge=1, le=100)
    governingLaw: str = Field(max_length=300)
    jurisdiction: str = Field(max_length=500)
    modifications: str = Field(max_length=4000)
    party1: PartyContext
    party2: PartyContext

    @field_validator("effectiveDate")
    @classmethod
    def valid_iso_date(cls, value: str) -> str:
        if value and (len(value) != 10 or date.fromisoformat(value).isoformat() != value):
            raise ValueError("Use YYYY-MM-DD.")
        return value


class SavedDocumentRequest(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    state: SavedDocumentState


class SavedDocumentSummary(StrictModel):
    id: str
    title: str
    templateId: str
    createdAt: str
    updatedAt: str


class SavedDocument(SavedDocumentSummary):
    state: SavedDocumentState


class TemplateSuggestion(StrictModel):
    templateId: str
    reason: str = Field(min_length=1, max_length=300)


class ChatResponse(StrictModel):
    reply: str = Field(min_length=1, max_length=2000)
    updates: NdaPatch | None
    fieldUpdates: list[FieldUpdate] = Field(max_length=100)
    suggestions: list[TemplateSuggestion] = Field(max_length=3)
    needsMoreInformation: bool
    nextQuestion: str | None = Field(max_length=500)

    @model_validator(mode="after")
    def question_matches_information_need(self):
        if self.needsMoreInformation != bool(self.nextQuestion and self.nextQuestion.strip()):
            raise ValueError("A concise follow-up question is required when more information is needed.")
        return self

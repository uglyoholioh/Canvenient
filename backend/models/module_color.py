from pydantic import BaseModel, Field, field_validator


class ModuleColorUpdate(BaseModel):
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")

    @field_validator("color")
    @classmethod
    def normalize_color(cls, value: str) -> str:
        return value.upper()


class ModulePaletteUpdate(BaseModel):
    palette: str

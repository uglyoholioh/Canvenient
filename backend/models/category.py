from pydantic import BaseModel, Field, field_validator


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    color: str = Field(default="#2F7A72", max_length=20)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Category name cannot be empty.")
        return name


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, max_length=20)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return value

        name = value.strip()
        if not name:
            raise ValueError("Category name cannot be empty.")
        return name


class CategoryOut(BaseModel):
    id: int
    name: str
    color: str

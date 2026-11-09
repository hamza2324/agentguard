from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Action(Model):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class Scenario(Model):
    id: str = Field(min_length=1)
    title: str
    category: str
    input: str = Field(max_length=10000)
    context: dict[str, Any] = Field(default_factory=dict)
    expected_state: dict[str, Any]
    required_tools: list[Action] = Field(default_factory=list)
    forbidden_tools: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    output_schema: dict[str, Any] | None = None
    tags: list[str] = Field(default_factory=list)
    required_response: list[Annotated[str, Field(min_length=1)]] = Field(default_factory=list)


class Dataset(Model):
    schema_version: Literal["1"] = "1"
    id: str
    version: int = Field(ge=1)
    scenarios: list[Scenario] = Field(min_length=1, max_length=1000)

    def check_unique(self):
        if len({s.id for s in self.scenarios}) != len(self.scenarios):
            raise ValueError("Scenario IDs must be unique")
        return self


class Span(Model):
    id: str
    tool: str
    arguments: dict[str, Any]
    result: dict[str, Any]
    duration_ms: float = Field(ge=0)


class Execution(Model):
    response: str
    state: dict[str, Any]
    evidence: list[str]
    spans: list[Span] | None
    duration_ms: float = Field(ge=0)
    tokens: int | None = Field(default=None, ge=0)
    cost: float | None = Field(default=None, ge=0)
    error: str | None = None


class Score(Model):
    evaluator: str
    passed: bool | None
    reason: str


class Result(Model):
    scenario: Scenario
    execution: Execution
    scores: list[Score]
    passed: bool


class Run(Model):
    schema_version: Literal["1"] = "1"
    id: str
    version: Literal["baseline", "candidate"]
    dataset_id: str
    dataset_version: int
    dataset_hash: str
    created_at: str
    results: list[Result]
    metrics: dict[str, float | None]

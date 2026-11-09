"""Executable example adapter. Replace the call to build_agent with your own agent.

Run: uv run uvicorn http_agent:app --app-dir examples --host 127.0.0.1 --port 9000
Set PYTHONPATH=backend/src when running directly from this monorepo.
"""

from fastapi import FastAPI
from pydantic import BaseModel, Field

from agentguard.agent import build_agent
from agentguard.models import Execution

app = FastAPI(title="AgentGuard example HTTP adapter")


class AgentRequest(BaseModel):
    input: str = Field(min_length=1, max_length=10000)
    context: dict = Field(default_factory=dict)


@app.get("/health")
def health():
    return {"status": "ok", "synthetic": True}


@app.post("/baseline", response_model=Execution)
def baseline(request: AgentRequest):
    return build_agent("baseline").invoke({"message": request.input, "context": request.context})[
        "execution"
    ]


@app.post("/candidate", response_model=Execution)
def candidate(request: AgentRequest):
    return build_agent("candidate").invoke({"message": request.input, "context": request.context})[
        "execution"
    ]

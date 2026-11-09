"""Loopback-only development API. Do not expose without authentication."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
from threading import BoundedSemaphore
from typing import Literal
from time import perf_counter

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import Field

from agentguard.engine import compare, load_dataset, run
from agentguard.agent import build_agent
from agentguard.models import Dataset, Execution, Model, Run, Scenario
from agentguard.storage import database, listing, save
from agentguard.assessment import Assessment, AssessmentOptions, Observation, assess
from agentguard.connector import invoke, validate_endpoint

ROOT = Path(__file__).resolve().parents[3]


class RunRequest(Model):
    version: Literal["baseline", "candidate"]
    dataset_id: str = "support-operations"


class PlaygroundRequest(Model):
    input: str = Field(min_length=1, max_length=10000)
    version: Literal["baseline", "candidate"]
    context: dict[str, str] = Field(default_factory=dict)


class LiveAssessmentRequest(Model):
    agent_name: str = Field(min_length=1, max_length=120)
    baseline_version: str = Field(min_length=1, max_length=80)
    candidate_version: str = Field(min_length=1, max_length=80)
    baseline_endpoint: str = Field(max_length=2000)
    candidate_endpoint: str = Field(max_length=2000)
    scenarios: list[Scenario] = Field(min_length=1, max_length=10)
    options: AssessmentOptions = Field(default_factory=AssessmentOptions)


class ComparisonRequest(Model):
    baseline_id: str
    candidate_id: str
    threshold: float = Field(default=0, ge=0, le=1)


class ReviewRequest(Model):
    run_id: str
    scenario_id: str
    note: str = Field(min_length=1, max_length=5000)
    approved: bool
    scenario: Scenario


def create_app(url=None):
    engine = database(url)
    pool = ThreadPoolExecutor(max_workers=1)

    @asynccontextmanager
    async def lifespan(app):
        yield
        pool.shutdown(wait=True)
        engine.dispose()

    app = FastAPI(title="AgentGuard", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
        ],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    capacity = BoundedSemaphore(2)
    if not listing(engine, "dataset"):
        dataset = load_dataset(ROOT / "datasets/support-v1.json")
        save(engine, "dataset", dataset.model_dump(), dataset.id)

    def get(kind, identifier):
        found = next((v for v in listing(engine, kind) if v["id"] == identifier), None)
        if found is None:
            raise HTTPException(404, f"{kind} not found")
        return found

    @app.get("/health")
    def health():
        return {"status": "ok", "mode": "local", "paid_apis_required": False}

    @app.get("/agents")
    def agents():
        return [
            {
                "id": "support",
                "versions": ["baseline", "candidate"],
                "execution": "local deterministic LangGraph",
            }
        ]

    @app.post("/playground", response_model=Execution)
    def playground(request: PlaygroundRequest):
        if not capacity.acquire(blocking=False):
            raise HTTPException(429, "Agent execution capacity is full")
        try:
            agent = build_agent(request.version)
            return agent.invoke({"message": request.input, "context": request.context})["execution"]
        finally:
            capacity.release()

    @app.get("/datasets")
    def datasets():
        return listing(engine, "dataset")

    @app.get("/assessments/{identifier}")
    def assessment_report(identifier: str):
        return get("assessment", identifier)

    @app.post("/assessments", status_code=201)
    def imported_assessment(request: Assessment):
        report = assess(request)
        save(engine, "assessment", report, report["id"])
        return report

    @app.post("/assessments/live", status_code=201)
    async def live_assessment(request: LiveAssessmentRequest):
        allowed = {
            u.strip() for u in os.getenv("AGENTGUARD_ALLOWED_ENDPOINTS", "").split(",") if u.strip()
        }
        allow_local = os.getenv("AGENTGUARD_ALLOW_LOOPBACK", "0") == "1"
        try:
            for endpoint in [request.baseline_endpoint, request.candidate_endpoint]:
                validate_endpoint(endpoint, allowed, allow_loopback=allow_local)
            # Validate assertions and schemas before contacting either endpoint.
            empty = {"response": "", "state": {}}
            Assessment(
                agent_name=request.agent_name,
                baseline_version=request.baseline_version,
                candidate_version=request.candidate_version,
                options=request.options,
                cases=[
                    {"scenario": s, "baseline": empty, "candidate": empty}
                    for s in request.scenarios
                ],
            )
        except ValueError as error:
            raise HTTPException(
                422, "Review assertions and provision exact endpoint allowlists on the local server"
            ) from error
        if not capacity.acquire(blocking=False):
            raise HTTPException(429, "Evaluation capacity is full")
        try:
            cases = []
            for scenario in request.scenarios:
                versions = {}
                for version, endpoint in [
                    ("baseline", request.baseline_endpoint),
                    ("candidate", request.candidate_endpoint),
                ]:
                    started = perf_counter()
                    try:
                        execution = await invoke(
                            endpoint,
                            allowed,
                            scenario.input,
                            scenario.context,
                            allow_loopback=allow_local,
                        )
                        observed = execution.model_dump(exclude={"cost"})
                        observed["duration_ms"] = (perf_counter() - started) * 1000
                        versions[version] = Observation.model_validate(observed)
                    except Exception as error:
                        versions[version] = Observation(
                            response="",
                            state={},
                            duration_ms=(perf_counter() - started) * 1000,
                            error=f"Agent request failed ({type(error).__name__})",
                        )
                cases.append({"scenario": scenario, **versions})
            report = assess(
                Assessment(
                    agent_name=request.agent_name,
                    baseline_version=request.baseline_version,
                    candidate_version=request.candidate_version,
                    cases=cases,
                    options=request.options,
                ),
                mode="fresh HTTP execution / local Python backend; round-trip latency",
            )
            save(engine, "assessment", report, report["id"])
            return report
        finally:
            capacity.release()

    @app.post("/datasets", status_code=201)
    def import_dataset(dataset: Dataset):
        try:
            dataset.check_unique()
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        identifier = f"{dataset.id}-v{dataset.version}"
        if any(d["id"] == identifier for d in listing(engine, "dataset")):
            raise HTTPException(409, "Dataset version exists")
        save(engine, "dataset", dataset.model_dump(), identifier)
        return {"id": identifier}

    @app.get("/runs")
    def runs():
        return listing(engine, "run")

    @app.get("/runs/{identifier}")
    def get_run(identifier: str):
        return get("run", identifier)

    @app.get("/jobs/{identifier}")
    def job(identifier: str):
        return get("job", identifier)

    @app.post("/runs", status_code=202)
    def start_run(request: RunRequest):
        data = get("dataset", request.dataset_id)
        data["id"] = request.dataset_id
        dataset = Dataset.model_validate(data)
        if not capacity.acquire(blocking=False):
            raise HTTPException(429, "Evaluation queue full")
        identifier = save(engine, "job", {"status": "queued"})

        def work():
            try:
                save(engine, "job", {"status": "running"}, identifier)
                report = run(dataset, request.version)
                save(engine, "run", report.model_dump(), report.id)
                save(engine, "job", {"status": "completed", "run_id": report.id}, identifier)
            except Exception:
                logging.getLogger(__name__).error("Evaluation job %s failed", identifier)
                save(
                    engine,
                    "job",
                    {"status": "failed", "error": "Evaluation failed; inspect server logs"},
                    identifier,
                )
            finally:
                capacity.release()

        pool.submit(work)
        return {"job_id": identifier}

    @app.post("/comparisons")
    def comparison(request: ComparisonRequest):
        try:
            report = compare(
                Run.model_validate(get("run", request.baseline_id)),
                Run.model_validate(get("run", request.candidate_id)),
                request.threshold,
            )
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        identifier = save(engine, "comparison", report)
        return {"id": identifier, **report}

    @app.get("/reviews")
    def reviews():
        return listing(engine, "review")

    @app.post("/reviews", status_code=201)
    def review(request: ReviewRequest):
        source = Run.model_validate(get("run", request.run_id))
        failed = next(
            (r for r in source.results if r.scenario.id == request.scenario_id and not r.passed),
            None,
        )
        if failed is None:
            raise HTTPException(422, "Select an observed failed scenario")
        if not request.approved:
            raise HTTPException(422, "Human approval of input and assertions required")
        dataset = Dataset(
            id="reviewed-regressions",
            version=len(listing(engine, "review")) + 1,
            scenarios=[request.scenario],
        )
        dataset_id = f"{dataset.id}-v{dataset.version}"
        save(engine, "dataset", dataset.model_dump(), dataset_id)
        review_id = save(engine, "review", request.model_dump())
        return {"id": review_id, "dataset_id": dataset_id}

    return app

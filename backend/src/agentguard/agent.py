"""A rule-driven LangGraph support agent, with real local tool execution.

The agent never receives assertions, scenario IDs, or expected outcomes.
Candidate defects: widened refund window, skipped urgent escalation, wrong ticket tool.
"""

import re
from time import perf_counter
from typing import Any, TypedDict
from uuid import uuid4

from langgraph.graph import END, START, StateGraph

from agentguard.models import Execution, Span

ORDERS = {
    "A100": {"status": "delivered", "age_days": 10, "damaged": False},
    "A101": {"status": "shipped", "age_days": 2, "damaged": False},
    "A102": {"status": "delivered", "age_days": 45, "damaged": False},
    "A103": {"status": "cancelled", "age_days": 1, "damaged": False},
    "A104": {"status": "delivered", "age_days": 30, "damaged": False},
    "A105": {"status": "delivered", "age_days": 31, "damaged": False},
    "A106": {"status": "delivered", "age_days": 0, "damaged": True},
}


class State(TypedDict):
    message: str
    context: dict[str, Any]
    execution: Execution


def execute(message: str, context: dict, version: str) -> Execution:
    started = perf_counter()
    spans = []
    evidence = []
    state = {}

    def tool(name, arguments):
        start = perf_counter()
        if name == "lookup_order":
            result = ORDERS.get(arguments["order_id"], {"error": "not_found"}).copy()
        elif name == "get_policy":
            result = {"refund_days": 30, "reference": "refund-policy-v1"}
        elif name == "create_ticket":
            result = {"ticket": "mock-ticket", "kind": arguments["kind"]}
        elif name == "escalate":
            result = {"escalated": True, "queue": "urgent"}
        else:
            raise ValueError("Unknown tool")
        spans.append(
            Span(
                id=uuid4().hex,
                tool=name,
                arguments=arguments,
                result=result,
                duration_ms=(perf_counter() - start) * 1000,
            )
        )
        return result

    text = message.lower()
    match = re.search(r"\bA\d{3}\b", message.upper())
    order_id = match.group() if match else context.get("order_id")
    if any(word in text for word in ["fraud", "unsafe", "supervisor", "injury"]):
        if version == "baseline":
            state.update(tool("escalate", {"reason": "urgent"}))
        else:
            state["escalated"] = False
        response = "Your case has been routed." if state["escalated"] else "Please wait."
    elif any(word in text for word in ["ticket", "address", "invoice", "missing item"]):
        kind = "invoice" if "invoice" in text else "support"
        if version == "candidate":
            tool("get_policy", {})
            state["ticket_created"] = False
        else:
            tool("create_ticket", {"kind": kind})
            state["ticket_created"] = True
        response = "Support request recorded." if state["ticket_created"] else "See our policy."
    elif "policy" in text and not order_id:
        policy = tool("get_policy", {})
        evidence.append(policy["reference"])
        state["refund_days"] = policy["refund_days"]
        response = "Refunds are available within 30 days of delivery."
    elif not order_id:
        state["needs_order_id"] = True
        response = "Please provide your order ID."
    else:
        order = tool("lookup_order", {"order_id": order_id})
        evidence.append(order_id)
        if "error" in order:
            state["not_found"] = True
            response = "Order not found. Please check the ID."
        elif any(word in text for word in ["refund", "return"]):
            policy = tool("get_policy", {})
            evidence.append(policy["reference"])
            days = 60 if version == "candidate" else policy["refund_days"]
            state["refund_eligible"] = order["status"] == "delivered" and order["age_days"] <= days
            response = (
                "Refund eligible."
                if state["refund_eligible"]
                else "Not eligible under the refund policy."
            )
        else:
            state["status"] = order["status"]
            response = f"Order {order_id} is {order['status']}."
    return Execution(
        response=response,
        state=state,
        evidence=evidence,
        spans=spans,
        duration_ms=(perf_counter() - started) * 1000,
    )


def build_agent(version):
    if version not in {"baseline", "candidate"}:
        raise ValueError("Unknown agent version")
    graph = StateGraph(State)
    graph.add_node(
        "support", lambda state: {"execution": execute(state["message"], state["context"], version)}
    )
    graph.add_edge(START, "support")
    graph.add_edge("support", END)
    return graph.compile()

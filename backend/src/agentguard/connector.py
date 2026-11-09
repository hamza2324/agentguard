"""HTTP contract with exact endpoint allowlisting and no redirects.

Endpoints are operator-provisioned, not accepted through public API input.
DNS rebinding remains an infrastructure concern: use an egress firewall in hosting.
"""

import ipaddress
import socket
from urllib.parse import urlsplit

import httpx

from agentguard.models import Execution


def validate_endpoint(url: str, allowlist: set[str], allow_loopback=False):
    parsed = urlsplit(url)
    local = allow_loopback and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
    if (
        url not in allowlist
        or (parsed.scheme != "https" and not (local and parsed.scheme == "http"))
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.fragment
    ):
        raise ValueError("Endpoint must be an explicitly allowed HTTPS URL")
    for entry in socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM):
        address = ipaddress.ip_address(entry[4][0])
        if not address.is_global and not (local and address.is_loopback):
            raise ValueError("Private, loopback and reserved destinations are forbidden")


async def invoke(url, allowlist, message, context, transport=None, allow_loopback=False):
    validate_endpoint(url, allowlist, allow_loopback=allow_loopback)
    async with httpx.AsyncClient(
        timeout=10, follow_redirects=False, trust_env=False, transport=transport
    ) as client:
        response = await client.post(url, json={"input": message, "context": context})
        response.raise_for_status()
        if len(response.content) > 1_000_000:
            raise ValueError("Response exceeds 1 MB")
        return Execution.model_validate(response.json())

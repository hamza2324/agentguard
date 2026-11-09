# Security

The backend is intended for single-user loopback development. It has no authentication, durable job isolation, or public service rate limiter. Do not expose it directly. Use an authenticated gateway, egress controls, body limits, authorization and a durable worker design before hosting.

Public reports are generated only from synthetic reference records. External traces may contain sensitive content: do not place them under `apps/web/public`. Credentials are not accepted by the dashboard or public workflow. The HTTP connector uses a strict operator allowlist but requires infrastructure protections against DNS rebinding.

For a security issue, contact the repository maintainer privately through their verified GitHub profile after publication. Do not put credentials or sensitive exploit data in a public issue. No private reporting contact is configured in this checkout.

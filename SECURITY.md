# Security policy

Headtower is an admin console for a network control plane, so security reports
get priority over everything else.

## Reporting a vulnerability

**Do not open a public issue.** Instead use GitHub's private reporting:
[Report a vulnerability](https://github.com/rnihesh/headtower/security/advisories/new).

Include what you found, how to reproduce it, and the impact you believe it has.
You will get an acknowledgement within a few days and updates as a fix lands.

## Scope

- Authentication and session handling (OIDC flows, operator mode, cookies)
- RBAC bypasses on server actions or API routes
- Leaks of Headscale API keys, OIDC secrets, or other stored credentials
- The optional Go agent and its browser-SSH bridge

## Hardening a deployment

- Serve the console over HTTPS only, behind your reverse proxy.
- Treat `HEADSCALE_API_KEY` as a root credential; scope filesystem access to
  the container.
- Enable OIDC and assign least-privilege roles; operator mode (no sign-in) is
  for trusted, private networks only.
- Keep the database volume private; it holds sessions and the audit log.

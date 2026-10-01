# Megaganky Lab

Megaganky Lab is a fictional interface-testing sandbox hosted as a static
GitHub Pages site. It demonstrates responsive components, dummy forms, Glia
engagement routing, and a test-only authentication flow.

## Safety

- The project does not represent a real company or production service.
- Every page is marked `noindex, nofollow, noarchive`.
- A persistent warning asks visitors not to submit real credentials,
  personal data, or confidential information.
- Public registration is intentionally disabled.
- The login accepts only the supplied fictional test identity.

## Demo login

Use only these project-specific values:

```text
demo@megaganky-lab.test
demo1234
```

The login is retained to test Cloudflare Worker validation, session state,
short-lived Glia Direct ID tokens, refresh, and logout.

## Pages

- `index.html` — sandbox overview
- `about.html` — project purpose and safety boundaries
- `services.html` — reusable component library
- `projects.html` — fictional test scenarios
- `contact.html` — dummy form and Glia routing tests
- `login.html` — supplied-identity authentication test
- `dashboard.html` — authenticated fictional workspace

## Local development

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765/`.

## Deployment

`push.sh` stages the project, runs the repository's secret scan through the
configured Git hook, commits the result, and pushes the current branch.

The authentication Worker lives in `worker/`. Its public registration route
has been removed; only login, token refresh, logout, and health checks remain.

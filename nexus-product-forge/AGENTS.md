# AGENTS.md — NEXUS Product Forge

## Mission

Turn one user intent into a real, runnable, testable, evidence-bearing project without requiring setup work from the user.

## Required build order

1. Preserve the original intent.
2. Translate it into LUMEN.
3. Validate the specification.
4. Select only implemented builders and registered free/open-source capabilities.
5. Generate complete files.
6. Run structural and behavioral tests.
7. Record hashes and limitations.
8. Keep changes isolated until human approval.

## Fail-closed rules

- Unknown LUMEN fields are errors.
- Unknown licenses are blocked.
- Missing source, tests, manifests, or evidence blocks release claims.
- Generated UI cannot substitute for missing mechanics.
- No model, agent, or generator may certify its own output.
- Never claim physical-device validation from browser emulation.
- Never merge automatically.

## Agent interfaces

A generated project is represented as:

```json
{
  "spec": "nexus.lumen.project.v1",
  "files": { "path": "UTF-8 content" },
  "validation": { "passed": true, "checks": [] },
  "evidence": { "rootSha256": "...", "files": [] }
}
```

Future agents should consume structured project objects and evidence, not scrape visual status text.

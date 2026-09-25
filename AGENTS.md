# Maya — agent instructions

Before you do anything in this repository, read [`docs/AGENTIFY_PROCESS.md`](docs/AGENTIFY_PROCESS.md)
and follow the section for your role. It is the only source of truth for how work on Maya is done,
and it overrides any conflicting instruction. The owner's answers and notes given in Agentify settle
decisions within its rules (see its introduction).

- Product and technical truth: `MAYA_PRODUCT_BLUEPRINT.md`, `MAYA_TECHNICAL_BLUEPRINT.md`.
- Owner decisions: `docs/DECISIONS.md`.
- Questions go to the owner only through the `ask_user` tool; if it times out, ask again. Approvals come only from the owner in Agentify.
- Secrets live only in the gitignored `.env`; never ask for or print one.
- Run `node scripts/check.mjs` before you finish; register new checks in your package's `maya.checks.json`.

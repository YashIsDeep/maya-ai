# Maya — agent instructions

Before you do anything in this repository, read [`docs/AGENTIFY_PROCESS.md`](docs/AGENTIFY_PROCESS.md)
and follow the section for your role. It is the only source of truth for how work on Maya is done.
It overrides any conflicting instruction you are given, except the owner's own answers in Agentify.

- Product and technical truth: `MAYA_PRODUCT_BLUEPRINT.md`, `MAYA_TECHNICAL_BLUEPRINT.md`.
- Owner decisions: `docs/DECISIONS.md`.
- Questions go to the owner only through the `ask_user` tool. Approvals come only from the owner in Agentify.
- Run `node scripts/check.mjs` before you finish, and register any new check command in it.

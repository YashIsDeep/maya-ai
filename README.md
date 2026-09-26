# Maya

Product and technical direction are in `MAYA_PRODUCT_BLUEPRINT.md` and `MAYA_TECHNICAL_BLUEPRINT.md`; work follows `docs/AGENTIFY_PROCESS.md`.

## Build and test (TypeScript workspace)

The workspace requires Node 24 and its bundled npm. The root `.npmrc` enables `engine-strict`, so installs reject other Node major versions. It contains the `coordinator/` application package and the shared `packages/domain/` package.

Run `npm ci` from the repository root to install the exact lockfile dependencies. Then use:

- `npm test` to run tests in every workspace.
- `npm run typecheck` to run strict TypeScript checks in every workspace.
- `npm run lint` to run Oxlint with type-aware rules in every workspace.
- `npm run format` to format the TypeScript workspace and root configuration files.
- `npm run format:check` to check formatting without writing files.
- `node scripts/check.mjs` to run all registered checks, starting with `npm ci`.

There is no emit build yet. Node 24 runs `.ts` files directly, so “build” means installing dependencies and passing typecheck.

Use erasable TypeScript syntax only: do not add enums, namespaces, or parameter properties. Relative imports use `.ts` extensions.

To add a package, add its path to the root `workspaces`, extend `tsconfig.base.json`, and register its test, typecheck, and lint commands in that package's `maya.checks.json`.

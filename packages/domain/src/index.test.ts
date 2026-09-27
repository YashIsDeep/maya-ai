import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMAIN_OBJECTS, DOMAIN_PACKAGE, TASK_MACHINE } from "./index.ts";

test("the domain package names itself", () => {
  assert.equal(DOMAIN_PACKAGE, "@maya/domain");
});

test("the domain package re-exports its object registry and task machine", () => {
  assert.ok(DOMAIN_OBJECTS.task);
  assert.equal(TASK_MACHINE.name, "task");
});

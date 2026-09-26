import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMAIN_PACKAGE } from "@maya/domain";

test("the coordinator resolves the shared domain package", () => {
  assert.equal(DOMAIN_PACKAGE, "@maya/domain");
});

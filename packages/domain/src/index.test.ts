import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMAIN_PACKAGE } from "./index.ts";

test("the domain package names itself", () => {
  assert.equal(DOMAIN_PACKAGE, "@maya/domain");
});

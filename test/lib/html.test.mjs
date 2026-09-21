import assert from "node:assert/strict";
import test from "node:test";

import { esc } from "../../src/lib/html.ts";

test("esc covers all HTML-sensitive characters", () => {
  assert.equal(esc(`<a title="'">&`), "&lt;a title=&quot;&#39;&quot;&gt;&amp;");
});

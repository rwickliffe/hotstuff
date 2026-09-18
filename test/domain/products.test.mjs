import assert from "node:assert/strict";
import test from "node:test";

import {
  byMaker,
  featuredByMaker,
  isSoldOut,
} from "../../src/domain/products.ts";

test("featuredByMaker leads with flagged rows", () => {
  const rows = [
    { maker: "John", name: "A", featured: "" },
    { maker: "John", name: "B", featured: "yes" },
    { maker: "Paula", name: "C", featured: "yes" },
  ];
  assert.deepEqual(
    featuredByMaker(rows, "john").map((p) => p.name),
    ["B"],
  );
  assert.deepEqual(
    byMaker(rows, "John").map((p) => p.name),
    ["A", "B"],
  );
});

test("isSoldOut accepts the sheet spelling", () =>
  assert.equal(isSoldOut({ sold_out: "sold out" }), true));

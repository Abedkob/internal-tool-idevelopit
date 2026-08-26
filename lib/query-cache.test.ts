import assert from "node:assert/strict";
import test from "node:test";
import { cachedBrowserQuery, invalidateBrowserQueries } from "./query-cache.ts";

function withBrowserEnvironment(run: () => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  return run().finally(() => {
    invalidateBrowserQueries();
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
}

test("browser cache deduplicates concurrent reference reads", async () => {
  await withBrowserEnvironment(async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return ["team"];
    };
    const [first, second] = await Promise.all([
      cachedBrowserQuery("reference:test", loader, 60_000),
      cachedBrowserQuery("reference:test", loader, 60_000),
    ]);
    assert.deepEqual(first, ["team"]);
    assert.deepEqual(second, ["team"]);
    assert.equal(calls, 1);
  });
});

test("cache invalidation refreshes matching data", async () => {
  await withBrowserEnvironment(async () => {
    let calls = 0;
    const loader = async () => ++calls;
    assert.equal(await cachedBrowserQuery("reference:test", loader, 60_000), 1);
    invalidateBrowserQueries(["reference:"]);
    assert.equal(await cachedBrowserQuery("reference:test", loader, 60_000), 2);
  });
});

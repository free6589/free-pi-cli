import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { resultLines, truncate, widgetLines, type Todo } from "../src/todo-view";

const sample = (): Todo[] => [
  { id: 1, text: "Read failing test", done: true },
  { id: 2, text: "Find expiry calc", done: true },
  { id: 3, text: "Fix off-by-one in expiresAt", done: false },
  { id: 4, text: "Re-run tests", done: false },
];

describe("widgetLines", () => {
  test("compact form when it fits", () => {
    expect(widgetLines(sample(), 100)).toEqual([
      "Todos 2/4  ✓ Read failing test  ✓ Find expiry calc  ▸ Fix off-by-one in expiresAt  ○ Re-run tests",
    ]);
  });

  test("tall form at width 60", () => {
    expect(widgetLines(sample(), 60)).toEqual(["Todos 2/4", "▸ Fix off-by-one in expiresAt", "○ Re-run tests"]);
  });

  test("tall form shows 3 open items and +N more, max 5 lines", () => {
    const many: Todo[] = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, text: `item number ${i + 1} text`, done: i < 3 }));
    const lines = widgetLines(many, 40);
    expect(lines).toEqual(["Todos 3/7", "▸ item number 4 text", "○ item number 5 text", "○ item number 6 text", "+1 more · /todos for all"]);
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  test("long text is truncated with an ellipsis to the width", () => {
    const lines = widgetLines([{ id: 1, text: "x".repeat(80), done: false }], 30);
    expect(lines[1]!.length).toBe(30);
    expect(lines[1]!.endsWith("…")).toBe(true);
  });

  test("wide glyphs count 2 cells: the compact line never renders past the width", () => {
    // The old code-point check passed this 163-code-point compact line at a
    // 165-cell budget; it rendered 171 cells, 172 with todo-tool's one-column
    // pad, on a 167-column terminal. Cells, not code points, decide.
    const todos: Todo[] = [{ id: 1, done: false, text: `${"a".repeat(142)}${"界".repeat(8)}` }];
    const lines = widgetLines(todos, 165).map((l) => ` ${l}`); // todo-tool pads one column
    expect(lines.length).toBeGreaterThan(1); // compact branch no longer taken
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(166);
  });

  test("all done: compact when it fits, header plus 'All done' when tall", () => {
    const done = sample().map((t) => ({ ...t, done: true }));
    expect(widgetLines(done, 200)[0]).toContain("Todos 4/4");
    expect(widgetLines(done, 30)).toEqual(["Todos 4/4", "✓ All done"]);
  });

  test("empty list renders nothing", () => {
    expect(widgetLines([], 80)).toEqual([]);
  });

  test("styling wraps whole segments; the first open item is highlighted", () => {
    const st = { bold: (s: string) => `<b>${s}</b>`, dim: (s: string) => `<d>${s}</d>`, accent: (s: string) => `<a>${s}</a>`, error: (s: string) => s };
    expect(widgetLines(sample(), 100, st)[0]).toBe(
      "<b>Todos 2/4</b>  <d>✓ Read failing test</d>  <d>✓ Find expiry calc</d>  <a><b>▸ Fix off-by-one in expiresAt</b></a>  <d>○ Re-run tests</d>",
    );
  });
});

describe("truncate", () => {
  test("keeps short text, cuts long text", () => {
    expect(truncate("abc", 5)).toBe("abc");
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abc", 0)).toBe("");
  });
});

describe("resultLines", () => {
  const base = (todos: Todo[]) => ({ todos, nextId: 9 });
  test("toggle to done shows the item and the next open one", () => {
    const todos = sample();
    expect(resultLines({ action: "toggle", ...base(todos), item: todos[1]! })).toEqual([
      "● todo 2/4  ✓ Find expiry calc",
      "  next: Fix off-by-one in expiresAt",
    ]);
  });
  test("add shows the new item and the next open one", () => {
    const todos = sample();
    expect(resultLines({ action: "add", ...base(todos), item: todos[3]! })).toEqual([
      "● todo 2/4  + Re-run tests",
      "  next: Fix off-by-one in expiresAt",
    ]);
  });
  test("add of the only open item does not repeat it as next", () => {
    const todos: Todo[] = [{ id: 1, text: "one", done: false }];
    expect(resultLines({ action: "add", ...base(todos), item: todos[0]! })).toEqual(["● todo 0/1  + one"]);
  });
  test("list, clear, and error", () => {
    expect(resultLines({ action: "list", ...base(sample()) })).toEqual(["● todo 2/4"]);
    expect(resultLines({ action: "clear", todos: [], nextId: 1 })).toEqual(["● todo cleared"]);
    expect(resultLines({ action: "toggle", ...base([]), error: "#9 not found" })).toEqual(["Error: #9 not found"]);
  });
  test("finishing the last item has no next line", () => {
    const todos: Todo[] = [{ id: 1, text: "one", done: true }];
    expect(resultLines({ action: "toggle", ...base(todos), item: todos[0]! })).toEqual(["● todo 1/1  ✓ one"]);
  });
  test("wide glyphs are cut to width cells, not code points", () => {
    // CJK todo text: 2 cells per glyph. Without a width the full line is
    // returned (back-compat); with one it never renders past the budget.
    const item = { id: 1, done: false, text: "界".repeat(50) };
    const d = { action: "add" as const, todos: [item], nextId: 2, item };
    expect(visibleWidth(resultLines(d)[0]!)).toBeGreaterThan(40);
    const cut = resultLines(d, undefined, 40);
    expect(cut[0]!.endsWith("…")).toBe(true);
    for (const line of cut) expect(visibleWidth(line)).toBeLessThanOrEqual(40);
  });
  test("no width (Infinity default) keeps old verbatim lines", () => {
    const todos = sample();
    expect(resultLines({ action: "toggle", ...base(todos), item: todos[1]! })).toEqual([
      "● todo 2/4  ✓ Find expiry calc",
      "  next: Fix off-by-one in expiresAt",
    ]);
  });
});

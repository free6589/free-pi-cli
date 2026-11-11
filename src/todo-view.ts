// Pure rendering for the todo list: the live widget above the input box and
// the progress line shown in the conversation. Everything here is UI-only
// text; none of it is ever put in tool result content (the model's context).
// Widths are terminal cells (pi-tui visibleWidth), not code points: todo text
// is model-authored and regularly carries CJK/emoji, which take two cells.
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export interface Todo {
  id: number;
  text: string;
  done: boolean;
}

/** Colors the renderers need; todo-tool.ts maps pi's Theme onto this, tests use a plain one. */
export interface TodoStyle {
  bold(s: string): string;
  dim(s: string): string;
  accent(s: string): string;
  error(s: string): string;
}

export const PLAIN_STYLE: TodoStyle = { bold: (s) => s, dim: (s) => s, accent: (s) => s, error: (s) => s };

const GAP = "  ";

/**
 * pi-tui's truncateToWidth closes the ellipsis with `\x1b[0m` resets even for
 * unstyled input, which would cancel the caller's styling mid-line. When the
 * input carries no escape bytes there is nothing to close, so strip them and
 * keep plain lines byte-clean.
 */
function cutToWidth(text: string, width: number): string {
  const out = truncateToWidth(text, Math.max(0, width), "…");
  return text.includes("\x1b") ? out : out.replace(/\x1b\[0m/g, "");
}

/** Cut `text` to `max` terminal cells, ending in an ellipsis when it was cut. */
export function truncate(text: string, max: number): string {
  return cutToWidth(text, max);
}

function counts(todos: readonly Todo[]) {
  return { done: todos.filter((t) => t.done).length, total: todos.length };
}

/**
 * Widget lines for a list, at most 5. One line when everything fits in `width`:
 *   Todos 2/4  ✓ done  ▸ first open  ○ later open
 * otherwise a header, the first open item, up to two more open items, and a
 * "+N more" line. Empty list -> no lines.
 */
export function widgetLines(todos: readonly Todo[], width: number, st: TodoStyle = PLAIN_STYLE): string[] {
  if (todos.length === 0) return [];
  const { done, total } = counts(todos);
  const header = `Todos ${done}/${total}`;
  const firstOpen = todos.findIndex((t) => !t.done);

  const marks = todos.map((t, i) => (t.done ? `✓ ${t.text}` : i === firstOpen ? `▸ ${t.text}` : `○ ${t.text}`));
  // Cells, not code points: wide glyphs count 2. The old `[...joined].length`
  // check passed a 163-code-point line carrying 8 CJK glyphs, which rendered
  // 171 cells — 172 with the widget's one-column pad — on a 167-column terminal.
  const compactLength = visibleWidth([header, ...marks].join(GAP));
  if (compactLength <= width) {
    return [
      [
        st.bold(header),
        ...todos.map((t, i) => (t.done ? st.dim(marks[i]!) : i === firstOpen ? st.accent(st.bold(marks[i]!)) : st.dim(marks[i]!))),
      ].join(GAP),
    ];
  }

  const lines = [st.bold(truncate(header, width))];
  const open = todos.filter((t) => !t.done);
  if (open.length === 0) {
    lines.push(st.dim(truncate("✓ All done", width)));
    return lines;
  }
  open.slice(0, 3).forEach((t, i) => {
    const line = truncate(`${i === 0 ? "▸" : "○"} ${t.text}`, width);
    lines.push(i === 0 ? st.accent(st.bold(line)) : st.dim(line));
  });
  const more = open.length - 3;
  if (more > 0) lines.push(st.dim(truncate(`+${more} more · /todos for all`, width)));
  return lines;
}

export interface TodoDetails {
  action: "list" | "add" | "toggle" | "clear";
  todos: Todo[];
  nextId: number;
  /** The item an add or toggle touched, for the progress line. */
  item?: Todo;
  error?: string;
}

/** The conversation progress line(s) for a finished todo call, cut to `width` cells. */
export function resultLines(d: TodoDetails, st: TodoStyle = PLAIN_STYLE, width: number = Number.POSITIVE_INFINITY): string[] {
  if (d.error) return [st.error(`Error: ${d.error}`)];
  if (d.action === "clear") return [`${st.accent("●")} ${st.bold("todo")} cleared`];
  const { done, total } = counts(d.todos);
  const head = `${st.accent("●")} ${st.bold("todo")} ${done}/${total}`;
  let first = head;
  if (d.item && d.action === "add") first = `${head}${GAP}+ ${d.item.text}`;
  if (d.item && d.action === "toggle") first = `${head}${GAP}${d.item.done ? "✓" : "○"} ${d.item.text}`;
  const lines = [first];
  const next = d.todos.find((t) => !t.done);
  if ((d.action === "add" || d.action === "toggle") && next && next.id !== d.item?.id) lines.push(st.dim(`${GAP}next: ${next.text}`));
  return Number.isFinite(width) ? lines.map((line) => cutToWidth(line, width)) : lines;
}

// U1: replaces pi's built-in startup header (hidden via quietStartup, see
// pi-launch.ts) with a short free-pi header — name, model, welcome line, and
// the five commands a user needs. KTD1/KTD2: a plain object component
// (render/invalidate/setExpanded) with structural ThemeLike/TuiLike types —
// same approach as packages/pi-ads/src/style.ts; only pi-tui's pure width
// helpers are imported. Widths are terminal cells (visibleWidth), never
// string/code-point length: the model name can carry wide glyphs.
import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Structural subset of pi's `Theme` class actually used for styling. */
export interface ThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

/** Structural subset of pi's `TUI` actually used by the header component. */
export interface TuiLike {
  requestRender(): void;
}

// R2: fixed command list, in order, with descriptions. Names padded so every
// description starts at the same column.
const COMMANDS: ReadonlyArray<{ name: string; description: string }> = [
  { name: "/usage", description: "credits left today and refill time" },
  { name: "/support", description: "visit today's advertiser" },
  { name: "/tos", description: "terms of service" },
  { name: "/privacy-policy", description: "privacy policy" },
  { name: "/buy-credits", description: "get more usage" },
  { name: "/close-other-session", description: "free a stuck session on another machine" },
  { name: "/update", description: "get the latest free-pi" },
];

const NAME_COLUMN = 24; // 2 leading spaces + longest name (20) + 2 spaces gap

const WELCOME_LINE =
  "Welcome to Free Pi, ad-supported inference. Please visit our advertisers to support us.";

// Split into two lines rather than one 106-char line, so it fits the 100-column
// truncation rule in headerLines without ever being cut off with an ellipsis.
const CONSENT_LINE_1 = "Usage is funded by ads and training. By using free-pi you consent.";
const CONSENT_LINE_2 = "See /tos and /privacy-policy.";

const EXPANDED_HINT_LINE = "esc interrupt · ctrl+c clear / exit · / commands · ! bash";

/**
 * The update notice, in the same boxed shape pi uses for its own "Update
 * Available" banner — but for free-pi-cli's version, pointing at /update.
 * pi's own banner is suppressed (PI_SKIP_VERSION_CHECK, see pi-launch.ts)
 * because it names `pi update`, a command our users don't have.
 */
const UPDATE_BORDER_CHAR = "─";
const UPDATE_MAX_WIDTH = 100;

export function updateBannerLines(theme: ThemeLike, latest: string, width: number): string[] {
  const headline = "Update Available";
  const detail = `New version ${latest} is available. Run /update`;
  // One column is reserved for the left margin the caller adds.
  const inner = Math.max(0, Math.min(width - 1, UPDATE_MAX_WIDTH));
  if (inner <= 0) return [];
  const border = theme.fg("warning", UPDATE_BORDER_CHAR.repeat(inner));
  return [
    "",
    border,
    theme.bold(theme.fg("warning", truncate(headline, inner))),
    theme.fg("dim", truncate(detail, inner)),
    border,
  ];
}

function truncate(text: string, maxWidth: number): string {
  const out = truncateToWidth(text, Math.max(0, maxWidth), "…");
  // pi-tui closes the ellipsis with reset codes even for unstyled input; the
  // header truncates plain text only (styling is applied around it), so strip
  // them to keep the line byte-identical to the pre-pi-tui truncation.
  return text.includes("\x1b") ? out : out.replace(/\x1b\[0m/g, "");
}

/**
 * Pure line builder for R1-R3 (+ R6 when expanded). Testable with a fake theme.
 * `width` is applied to the plain text before styling, so escape bytes never
 * count toward it; a line that does not fit is shown dim and truncated.
 */
export function headerLines(
  theme: ThemeLike,
  modelName: string,
  expanded: boolean,
  width: number = Number.POSITIVE_INFINITY,
  /** Newer free-pi-cli version, when the server reported one. Renders the update banner. */
  updateLatest?: string,
): string[] {
  // One column is reserved for the left margin added below.
  const inner = width - 1;
  const fit = (plain: string, styled: () => string): string =>
    visibleWidth(plain) <= inner ? styled() : theme.fg("dim", truncate(plain, inner));

  const titleRest = ` · ${modelName} · ctrl+o for help`;
  const title = fit(
    `free-pi${titleRest}`,
    () => `${theme.bold(theme.fg("accent", "free-pi"))}${theme.fg("dim", titleRest)}`,
  );

  const commandLines = COMMANDS.map(({ name, description }) => {
    const padded = `  ${name}`.padEnd(NAME_COLUMN, " ");
    return fit(`${padded}${description}`, () => `${padded}${theme.fg("dim", description)}`);
  });

  const dim = (plain: string) => fit(plain, () => theme.fg("dim", plain));

  const lines = [
    "",
    title,
    "",
    dim(WELCOME_LINE),
    "",
    dim(CONSENT_LINE_1),
    dim(CONSENT_LINE_2),
    "",
    ...commandLines,
    "",
  ];
  if (expanded) lines.push(dim(EXPANDED_HINT_LINE));
  if (updateLatest) lines.push(...updateBannerLines(theme, updateLatest, width));
  // pi indents its own header and widget lines by one column; match it.
  return lines.map((line) => (line === "" ? line : ` ${line}`));
}

export interface CreateHeaderExtensionOptions {
  modelName: string;
  /** Newer free-pi-cli version reported by /client-version, when one exists. */
  updateLatest?: string;
}

/** R1-R7: registers the `free-pi-header` inline extension. session_start only. */
export function createHeaderExtension(opts: CreateHeaderExtensionOptions): InlineExtension {
  return {
    name: "free-pi-header",
    factory(pi: ExtensionAPI) {
      pi.on("session_start", (_event, ctx) => {
        ctx.ui.setHeader((tui: TuiLike, theme: ThemeLike) => {
          let expanded = false;
          return {
            render(width: number): string[] {
              return headerLines(theme, opts.modelName, expanded, width, opts.updateLatest);
            },
            invalidate(): void {
              // no-op: headerLines has no cached state to drop.
            },
            setExpanded(next: boolean): void {
              expanded = next;
              tui.requestRender();
            },
          };
        });
      });
    },
  };
}

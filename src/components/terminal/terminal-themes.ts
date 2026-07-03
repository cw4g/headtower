import type { ITheme } from "@xterm/xterm";

/**
 * Named terminal color schemes, Termius-style. The "Console" theme follows the
 * app's own surface/ink tokens (so it flips with light/dark); the rest are
 * fixed, self-contained palettes an operator can pick per taste. Each ships a
 * full ANSI 16-color set so real shell output (ls, git, vim, htop) stays
 * legible - the terminal is the one place the console's "one accent" rule is
 * deliberately relaxed.
 */
export interface TerminalTheme {
  id: string;
  label: string;
  /** null = derive from the app's live CSS tokens (see resolveTheme). */
  theme: ITheme | null;
}

const CONSOLE: TerminalTheme = { id: "console", label: "Console", theme: null };

const GRAPHITE: ITheme = {
  background: "#0e1117",
  foreground: "#e6edf3",
  cursor: "#f5b544",
  cursorAccent: "#0e1117",
  selectionBackground: "rgba(245, 181, 68, 0.25)",
  black: "#161b22",
  brightBlack: "#646f7d",
  red: "#f43f5e",
  brightRed: "#fb7185",
  green: "#34d399",
  brightGreen: "#6ee7b7",
  yellow: "#f5b544",
  brightYellow: "#ffd98a",
  blue: "#60a5fa",
  brightBlue: "#93c5fd",
  magenta: "#c084fc",
  brightMagenta: "#d8b4fe",
  cyan: "#22d3ee",
  brightCyan: "#67e8f9",
  white: "#e6edf3",
  brightWhite: "#ffffff",
};

const MIDNIGHT: ITheme = {
  background: "#000000",
  foreground: "#e4e4e4",
  cursor: "#f5b544",
  cursorAccent: "#000000",
  selectionBackground: "rgba(245, 181, 68, 0.28)",
  black: "#0a0a0a",
  brightBlack: "#5c5c5c",
  red: "#ff5f5f",
  brightRed: "#ff8787",
  green: "#5fd75f",
  brightGreen: "#87ff87",
  yellow: "#f5b544",
  brightYellow: "#ffd98a",
  blue: "#5f9bff",
  brightBlue: "#87c1ff",
  magenta: "#c98bff",
  brightMagenta: "#dcb3ff",
  cyan: "#4fd7d7",
  brightCyan: "#87ffff",
  white: "#e4e4e4",
  brightWhite: "#ffffff",
};

const DRACULA: ITheme = {
  background: "#282a36",
  foreground: "#f8f8f2",
  cursor: "#ffb86c",
  cursorAccent: "#282a36",
  selectionBackground: "rgba(189, 147, 249, 0.35)",
  black: "#21222c",
  brightBlack: "#6272a4",
  red: "#ff5555",
  brightRed: "#ff6e6e",
  green: "#50fa7b",
  brightGreen: "#69ff94",
  yellow: "#f1fa8c",
  brightYellow: "#ffffa5",
  blue: "#bd93f9",
  brightBlue: "#d6acff",
  magenta: "#ff79c6",
  brightMagenta: "#ff92df",
  cyan: "#8be9fd",
  brightCyan: "#a4ffff",
  white: "#f8f8f2",
  brightWhite: "#ffffff",
};

const NORD: ITheme = {
  background: "#2e3440",
  foreground: "#d8dee9",
  cursor: "#88c0d0",
  cursorAccent: "#2e3440",
  selectionBackground: "rgba(136, 192, 208, 0.3)",
  black: "#3b4252",
  brightBlack: "#4c566a",
  red: "#bf616a",
  brightRed: "#bf616a",
  green: "#a3be8c",
  brightGreen: "#a3be8c",
  yellow: "#ebcb8b",
  brightYellow: "#ebcb8b",
  blue: "#81a1c1",
  brightBlue: "#81a1c1",
  magenta: "#b48ead",
  brightMagenta: "#b48ead",
  cyan: "#88c0d0",
  brightCyan: "#8fbcbb",
  white: "#e5e9f0",
  brightWhite: "#eceff4",
};

const SOLARIZED: ITheme = {
  background: "#002b36",
  foreground: "#93a1a1",
  cursor: "#cb4b16",
  cursorAccent: "#002b36",
  selectionBackground: "rgba(147, 161, 161, 0.25)",
  black: "#073642",
  brightBlack: "#586e75",
  red: "#dc322f",
  brightRed: "#cb4b16",
  green: "#859900",
  brightGreen: "#586e75",
  yellow: "#b58900",
  brightYellow: "#657b83",
  blue: "#268bd2",
  brightBlue: "#839496",
  magenta: "#d33682",
  brightMagenta: "#6c71c4",
  cyan: "#2aa198",
  brightCyan: "#93a1a1",
  white: "#eee8d5",
  brightWhite: "#fdf6e3",
};

const PAPER: ITheme = {
  background: "#fbfaf8",
  foreground: "#2b2b2b",
  cursor: "#d98a00",
  cursorAccent: "#fbfaf8",
  selectionBackground: "rgba(217, 138, 0, 0.2)",
  black: "#2b2b2b",
  brightBlack: "#8a8a8a",
  red: "#c7392f",
  brightRed: "#e05a50",
  green: "#3a8a3a",
  brightGreen: "#4faf4f",
  yellow: "#b07500",
  brightYellow: "#d19b00",
  blue: "#2660b0",
  brightBlue: "#4a82d0",
  magenta: "#9a3fb0",
  brightMagenta: "#b566c8",
  cyan: "#1f8f8f",
  brightCyan: "#3fb0b0",
  white: "#5a5a5a",
  brightWhite: "#1a1a1a",
};

export const TERMINAL_THEMES: TerminalTheme[] = [
  CONSOLE,
  GRAPHITE && { id: "graphite", label: "Graphite", theme: GRAPHITE },
  { id: "midnight", label: "Midnight", theme: MIDNIGHT },
  { id: "dracula", label: "Dracula", theme: DRACULA },
  { id: "nord", label: "Nord", theme: NORD },
  { id: "solarized", label: "Solarized", theme: SOLARIZED },
  { id: "paper", label: "Paper", theme: PAPER },
].filter(Boolean) as TerminalTheme[];

export const DEFAULT_THEME_ID = "console";
const STORAGE_KEY = "ht:terminal-theme";

/** Load the saved theme id (falling back to the default), client-only. */
export function loadThemeId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved && TERMINAL_THEMES.some((t) => t.id === saved)
    ? saved
    : DEFAULT_THEME_ID;
}

/** Persist the chosen theme id, client-only. */
export function saveThemeId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, id);
}

/**
 * Resolve a theme id to a concrete xterm ITheme. The "Console" theme has no
 * fixed palette - it's derived here from the app's live CSS tokens so it tracks
 * the app's own light/dark surface and ink.
 */
export function resolveTheme(id: string): ITheme {
  const entry = TERMINAL_THEMES.find((t) => t.id === id) ?? CONSOLE;
  if (entry.theme) return entry.theme;

  const cssVar = (name: string, fallback: string): string => {
    if (typeof window === "undefined") return fallback;
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return v || fallback;
  };
  const background = cssVar("--surface-2", "#1f262e");
  const foreground = cssVar("--ink", "#e6edf3");
  return {
    ...GRAPHITE,
    background,
    foreground,
    cursorAccent: background,
    black: background,
    brightBlack: cssVar("--ink-faint", "#646f7d"),
    white: foreground,
  };
}

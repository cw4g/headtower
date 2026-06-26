/**
 * HuJSON (JWCC) helpers - "JSON With Commas and Comments".
 *
 * Isomorphic and dependency-free: no server imports, no React. The Access view
 * (a client component) and any server caller can share these. Headscale remains
 * the authoritative validator on save; this only powers the in-browser readout
 * and the visual editor's parse step.
 */

/** Live validity of a HuJSON document, for the editor's status readout. */
export type Validity =
  | { kind: "empty" }
  | { kind: "valid" }
  | { kind: "invalid"; message: string };

/**
 * Strip `//` line comments, `/* *\/` block comments, and trailing commas from a
 * HuJSON source, respecting string spans so delimiters inside strings survive.
 * The result is plain JSON, ready for {@link JSON.parse}.
 */
export function stripHujson(source: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      out += c;
      if (c === "\\") {
        // Copy the escaped character verbatim.
        out += source[i + 1] ?? "";
        i++;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i++; // skip the closing '/'
      continue;
    }
    out += c;
  }
  // Drop trailing commas before a closing brace/bracket.
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/** Parse a HuJSON document into a plain JS value. Throws on invalid syntax. */
export function parseHujson(source: string): unknown {
  return JSON.parse(stripHujson(source));
}

/**
 * Best-effort, browser-side validity for the editor readout. HuJSON is JSON plus
 * comments and trailing commas, so we strip those (string-aware) then attempt a
 * parse.
 */
export function validateHujson(source: string): Validity {
  if (source.trim() === "") return { kind: "empty" };
  try {
    parseHujson(source);
    return { kind: "valid" };
  } catch (err) {
    return { kind: "invalid", message: cleanParseMessage(err) };
  }
}

/** Turn a parser error into a short, readable reason. */
export function cleanParseMessage(err: unknown): string {
  if (err instanceof Error) {
    // Browsers prefix with "JSON.parse:" or "Unexpected token"; trim the noise.
    return err.message.replace(/^JSON\.parse:\s*/i, "").trim();
  }
  return "Document is not valid HuJSON.";
}

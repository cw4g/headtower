/**
 * Lets `node --test` load the project's TypeScript sources directly.
 *
 * Node runs .ts files natively (type stripping), but a file containing ESM syntax
 * is treated as an ES module, and the ESM resolver requires a file extension. The
 * sources import each other the TypeScript way -- `from "./hujson"`, or through
 * the `@/` path alias from tsconfig -- so both forms need translating:
 *
 *   ./hujson          ->  ./hujson.ts
 *   @/lib/machines    ->  <repo>/src/lib/machines.ts
 *
 * Nothing else is changed, and a specifier that still fails falls through to
 * Node's own resolution so the error message stays honest.
 *
 * Used by the `test` script; not part of the application build. Needs a newer Node
 * than the app itself (`engines` allows 22.5): `registerHooks` landed in 22.15 and
 * type stripping became unflagged in 22.18 / 23.6.
 */
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const RELATIVE = /^\.{1,2}\//;
const HAS_EXTENSION = /\.[cm]?[jt]sx?$|\.json$/;
const ALIAS = "@/";

/** Repo root: this file lives in <root>/test/. */
const SRC = join(dirname(dirname(new URL(import.meta.url).pathname)), "src");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(ALIAS)) {
      const bare = join(SRC, specifier.slice(ALIAS.length));
      for (const candidate of HAS_EXTENSION.test(specifier)
        ? [bare]
        : [`${bare}.ts`, `${bare}.tsx`, join(bare, "index.ts")]) {
        try {
          return nextResolve(pathToFileURL(candidate).href, context);
        } catch {
          // try the next shape
        }
      }
    }

    if (RELATIVE.test(specifier) && !HAS_EXTENSION.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // fall through to the default resolution and let Node report it
      }
    }

    return nextResolve(specifier, context);
  },
});

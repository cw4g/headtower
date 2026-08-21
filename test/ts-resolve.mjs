/**
 * Lets `node --test` load the project's TypeScript sources directly.
 *
 * Node runs .ts files natively (type stripping), but a file containing ESM syntax
 * is treated as an ES module, and the ESM resolver requires a file extension. The
 * sources import each other the TypeScript way -- `from "./hujson"` -- so those
 * specifiers need the extension appended. Nothing else is changed: this only
 * retries a relative, extensionless specifier as `.ts`.
 *
 * Used by the `test` script; not part of the application build. Needs a newer Node
 * than the app itself (`engines` allows 22.5): `registerHooks` landed in 22.15 and
 * type stripping became unflagged in 22.18 / 23.6.
 */
import { registerHooks } from "node:module";

const EXTENSIONLESS = /^\.{1,2}\//;
const HAS_EXTENSION = /\.[cm]?[jt]sx?$|\.json$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (EXTENSIONLESS.test(specifier) && !HAS_EXTENSION.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // fall through to the default resolution and let Node report it
      }
    }
    return nextResolve(specifier, context);
  },
});

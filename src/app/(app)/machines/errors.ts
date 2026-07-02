/**
 * Machine views' one-line Headscale error copy.
 *
 * Re-exported from the shared classifier so the machine Server Actions can keep
 * importing {@link describeHeadscaleError} from `./errors` unchanged. The page
 * itself renders the richer `ConnectionError` panel; this is the concise inline
 * form for action failures. See `@/lib/headscale/describe`.
 */

export { describeHeadscaleError } from "@/lib/headscale/describe";

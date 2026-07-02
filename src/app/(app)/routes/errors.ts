/**
 * Routes views' one-line Headscale error copy.
 *
 * Re-exported from the shared classifier so the Routes server component and its
 * approve/revoke Server Actions can keep importing {@link describeHeadscaleError}
 * from `./errors` unchanged. See `@/lib/headscale/describe`.
 */

export { describeHeadscaleError } from "@/lib/headscale/describe";

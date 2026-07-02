/**
 * Access view's one-line Headscale error copy.
 *
 * Re-exported from the shared classifier so the Access server component and its
 * save-policy Server Action can keep importing {@link describeHeadscaleError}
 * from `./errors` unchanged. When Headscale rejects a policy document it returns
 * a precise reason (often with a line number) in the body; the shared classifier
 * surfaces that verbatim so the operator can fix the HuJSON.
 * See `@/lib/headscale/describe`.
 */

export { describeHeadscaleError } from "@/lib/headscale/describe";

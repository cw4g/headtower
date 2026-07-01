import Link from "next/link";
import { redirect } from "next/navigation";
import { BeaconMark } from "@/components/beacon-mark";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { listLoginProviders } from "@/lib/auth/oidc";
import { startLogin } from "./actions";

// Sign-in reads the live session + per-request params; never prerender it.
export const dynamic = "force-dynamic";

/** Provider/handshake error codes mapped to console-legible copy. */
const ERROR_COPY: Record<string, string> = {
  access_denied: "Sign-in was declined at the provider.",
  expired: "That sign-in attempt expired. Start again.",
  exchange_failed: "Could not complete sign-in with the provider. Try again.",
  disabled: "Single sign-on is not enabled on this console.",
};

const DEFAULT_ERROR = "Sign-in failed. Try again.";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const { next, error } = await searchParams;

  // An authenticated session (or operator mode) has no business here.
  const session = await getSession();
  if (session) redirect("/");

  const providers = listLoginProviders();
  const errorCode = first(error);

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="grid-field pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative w-full max-w-sm">
        <div className="rounded-card border border-line bg-surface p-8 shadow-xl shadow-graphite-950/20">
          {/* Brand: beacon mark in its housing + wordmark. */}
          <div className="flex flex-col items-center text-center">
            <BeaconMark className="h-12 w-12" />
            <h1 className="mt-4 text-lg font-semibold tracking-tight text-ink">
              head<span className="text-ink-muted">tower</span>
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Operator console for your Headscale tailnet.
            </p>
          </div>

          <div className="mt-7">
            {providers.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {providers.map((provider, index) => (
                  <form key={provider.id} action={startLogin}>
                    <input type="hidden" name="next" value={first(next) ?? ""} />
                    <input type="hidden" name="provider" value={provider.id} />
                    <Button
                      type="submit"
                      variant={index === 0 ? "solid" : "outline"}
                      size="md"
                      className="w-full"
                    >
                      {providers.length > 1
                        ? `Continue with ${provider.name}`
                        : "Sign in with single sign-on"}
                    </Button>
                  </form>
                ))}
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-ink-muted">
                  This console runs without single sign-on.
                </p>
                <Link
                  href="/"
                  className="mt-3 inline-flex text-sm font-medium text-beacon-500 hover:text-beacon-400"
                >
                  Enter the console
                </Link>
              </div>
            )}
          </div>

          {errorCode && (
            <p
              role="alert"
              className="mt-5 rounded-control border border-critical-500/40 bg-critical-500/10 px-3 py-2 text-center text-xs text-critical-500"
            >
              {ERROR_COPY[errorCode] ?? DEFAULT_ERROR}
            </p>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-ink-faint">
          Access is governed by your identity provider.
        </p>
      </div>
    </main>
  );
}

/** Collapse a possibly-repeated query param to its first string value. */
function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

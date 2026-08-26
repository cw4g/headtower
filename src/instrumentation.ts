/**
 * Next.js instrumentation hook.
 *
 * `register` is, per the framework reference, "called **once** when a new
 * Next.js server instance is initiated, and must complete before the server is
 * ready to handle requests". Both halves of that shape this file: it is the one
 * sanctioned place to start a process-wide background job, and it must not block
 * — so the sampler only arms timers here and never awaits a round trip.
 *
 * Next.js calls `register` in every runtime, so the Node-only work is guarded on
 * `NEXT_RUNTIME`; the edge runtime has neither `node:sqlite` nor a long-lived
 * process to keep a timer in.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Imported lazily, inside the guard: a static import would pull the database
  // and the Headscale client into every runtime this file is evaluated in.
  const { startSampler } = await import("@/lib/sampler");
  startSampler();
}

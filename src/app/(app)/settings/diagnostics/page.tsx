import { DiagnosticsRunner } from "./diagnostics-runner";

// The self-check probes live state on demand; never prebuild this view.
export const dynamic = "force-dynamic";

export default function DiagnosticsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-ink">
          Diagnostics
        </h2>
        <p className="text-sm text-ink-muted">
          Verify Headtower can reach and authenticate against the control plane.
        </p>
      </div>

      <DiagnosticsRunner />
    </div>
  );
}

import { redirect } from "next/navigation";

/** The console opens on the machines readout — the core operational view. */
export default function RootPage() {
  redirect("/machines");
}

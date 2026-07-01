import { redirect } from "next/navigation";

/** Settings has no landing view of its own; open the first section (must match settings-nav.tsx's ITEMS[0]). */
export default function SettingsPage() {
  redirect("/settings/connection");
}

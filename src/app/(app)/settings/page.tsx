import { redirect } from "next/navigation";

/** Settings has no landing view of its own; open the first section. */
export default function SettingsPage() {
  redirect("/settings/pre-auth-keys");
}

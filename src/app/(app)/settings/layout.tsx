import { SectionHeading } from "@/components/ui/section-heading";
import { SettingsNav } from "./settings-nav";

export const metadata = {
  title: "Settings",
};

/**
 * Settings shell: the section heading over a two-column layout - the schematic
 * sidebar rail on the left, the routed settings view on the right. Server
 * component; only the nav rail (active-segment highlighting) is interactive.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Console"
        title="Settings"
        description="Credentials and connection health for this control plane."
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { CustomBoard } from "@/components/tiers/CustomBoard";

/**
 * Standalone "My Tier Lists" page. All board logic now lives in the reusable
 * <CustomBoard /> component (client/src/components/tiers/CustomBoard.tsx), which
 * is also embedded as the "My Lists" sub-tab on the Demand Tiers page. This page
 * just wraps it in the app shell (Sidebar + Topbar).
 *
 * NOTE: the route for this page may be removed by the orchestrator; the component
 * is kept self-consistent so it works either way.
 */
export default function CustomTiers() {
  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--gradient-background)", fontFamily: "var(--font-primary)" }}
    >
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <Topbar
          title="My Tier Lists"
          subtitle="Drag watches into your own tiers"
        />

        <div className="p-6" style={{ background: "var(--gradient-background)" }}>
          <CustomBoard />
        </div>
      </main>
    </div>
  );
}

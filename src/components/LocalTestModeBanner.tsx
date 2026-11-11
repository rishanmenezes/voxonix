import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  isLocalTestModeEnabled,
  resolveActiveTestUserIdentifier,
  setActiveTestUserIdentifier,
  getLocalTestUser,
} from "@/lib/test-mode";
import { ShieldAlert, Users, PhoneCall, ChevronUp, ChevronDown } from "lucide-react";

export function LocalTestModeBanner() {
  const [enabled, setEnabled] = useState(false);
  const [activeUser, setActiveUser] = useState<string>("A");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const isEnabled = isLocalTestModeEnabled();
    setEnabled(isEnabled);
    if (!isEnabled) return;

    setActiveUser(resolveActiveTestUserIdentifier());

    const handleUpdate = () => {
      setActiveUser(resolveActiveTestUserIdentifier());
    };

    window.addEventListener("voxonix-test-user-changed", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("voxonix-test-user-changed", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  if (!enabled) return null;

  const currentTestUser = getLocalTestUser(activeUser);
  const displayName = (currentTestUser.user_metadata?.display_name as string) || "Test User";

  const handleSwitchUser = (target: "A" | "B") => {
    setActiveTestUserIdentifier(target);
    setActiveUser(target);
    window.dispatchEvent(new CustomEvent("voxonix-test-user-changed"));
  };

  return (
    <aside
      aria-label="Local test mode announcement"
      className="sticky top-0 z-50 w-full border-b border-amber-500/30 bg-amber-950/95 text-amber-200 backdrop-blur-md px-4 py-1.5 text-xs shadow-md transition-all"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">
          <span className="flex h-5 items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-300 uppercase border border-amber-500/30">
            <ShieldAlert className="h-3 w-3 text-amber-400" />
            LOCAL TEST MODE
          </span>
          <span className="hidden sm:inline text-amber-200/80">
            Developer Sandbox · Active Identity:
          </span>
          <span className="font-semibold text-amber-100 bg-amber-900/60 px-2 py-0.5 rounded border border-amber-500/20">
            {displayName} ({activeUser.toUpperCase()})
          </span>
        </div>

        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md bg-amber-900/50 p-0.5 border border-amber-500/20">
              <button
                type="button"
                onClick={() => handleSwitchUser("A")}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  activeUser.toUpperCase() === "A"
                    ? "bg-amber-500 text-black font-semibold shadow-sm"
                    : "text-amber-300 hover:text-amber-100"
                }`}
                title="Switch active identity to Test User A"
              >
                User A
              </button>
              <button
                type="button"
                onClick={() => handleSwitchUser("B")}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  activeUser.toUpperCase() === "B"
                    ? "bg-amber-500 text-black font-semibold shadow-sm"
                    : "text-amber-300 hover:text-amber-100"
                }`}
                title="Switch active identity to Test User B"
              >
                User B
              </button>
            </div>

            <Link
              to="/room/$roomId"
              params={{ roomId: "test-call" }}
              search={{ testUser: activeUser }}
              className="hidden md:inline-flex items-center gap-1 rounded bg-amber-500/20 hover:bg-amber-500/30 px-2.5 py-1 text-[11px] font-medium text-amber-200 border border-amber-500/30 transition"
            >
              <PhoneCall className="h-3 w-3 text-amber-400" />
              Join 1-to-1 Call (test-call)
            </Link>
          </div>
        )}

        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="text-amber-400 hover:text-amber-200 p-1 rounded transition"
          aria-label={collapsed ? "Expand test banner" : "Collapse test banner"}
          title={collapsed ? "Expand banner" : "Collapse banner"}
        >
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </aside>
  );
}

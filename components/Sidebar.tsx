"use client";

import {
  BarChart3,
  CheckSquare2,
  ContactRound,
  LayoutDashboard,
  LogOut,
  Settings2,
  SlidersHorizontal,
  WalletCards,
  FileText,
  Repeat2,
  PanelsTopLeft,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getNavigationCounts } from "@/lib/db";

const groups = [
  {
    label: "Workspace",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/contacts", label: "Contacts", icon: ContactRound },
      { href: "/pipeline", label: "Pipeline", icon: BarChart3 },
      { href: "/tasks", label: "Tasks", icon: CheckSquare2 },
      { href: "/expenses", label: "Expenses", icon: WalletCards },
    ],
  },
  {
    label: "Billing",
    links: [
      { href: "/contracts", label: "Contracts", icon: Repeat2 },
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/templates", label: "Templates", icon: PanelsTopLeft },
    ],
  },
  {
    label: "Configuration",
    links: [{ href: "/settings", label: "Settings", icon: Settings2 }],
  },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function Sidebar({
  user,
  open,
  mobile,
  onClose,
}: {
  user: { name: string; email: string; color: string };
  open: boolean;
  mobile: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [badges, setBadges] = useState({ contacts: 0, tasks: 0 });
  useEffect(() => {
    let active = true;
    async function refreshBadges() {
      try {
        const supabase = createClient();
        const counts = await getNavigationCounts(supabase);
        if (active)
          setBadges({
            contacts: counts.stale_contacts,
            tasks: counts.open_tasks,
          });
      } catch {
        // Page surfaces provide the detailed connection error.
      }
    }
    void refreshBadges();
    window.addEventListener("team-console:data-changed", refreshBadges);
    return () => {
      active = false;
      window.removeEventListener("team-console:data-changed", refreshBadges);
    };
  }, [pathname]);
  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <aside
      id="primary-sidebar"
      className={`sidebar ${open ? "sidebar-open" : ""}`}
      aria-hidden={mobile && !open}
      inert={mobile && !open}
    >
      <div className="sidebar-brand">
        <span className="brand-mark">TC</span>
        <span>Team Console</span>
        <button
          className="sidebar-close"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X size={19} />
        </button>
      </div>
      <div className="workspace-status">
        <span className="status-pulse" /> Shared workspace <span>03</span>
      </div>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-label">{group.label}</p>
            {group.links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              const badge =
                href === "/contacts"
                  ? badges.contacts
                  : href === "/tasks"
                    ? badges.tasks
                    : 0;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  className={`nav-link ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{label}</span>
                  {badge > 0 && (
                    <span
                      className="nav-badge"
                      aria-label={`${badge} ${href === "/contacts" ? "stale contacts" : "open tasks"}`}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-user">
        <p className="nav-label">Signed in as</p>
        <div className="user-row">
          <span className="avatar" style={{ backgroundColor: user.color }}>
            {initials(user.name)}
          </span>
          <span className="user-copy">
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </span>
          <button
            className="icon-button dark"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

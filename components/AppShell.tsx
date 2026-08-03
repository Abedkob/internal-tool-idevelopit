"use client";

import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; color: string };
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!mobile || !menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeButton =
      document.querySelector<HTMLButtonElement>(".sidebar-close");
    window.requestAnimationFrame(() => closeButton?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const sidebar = document.getElementById("primary-sidebar");
      const focusable = sidebar
        ? [
            ...sidebar.querySelectorAll<HTMLElement>(
              'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
            ),
          ].filter((element) => element.offsetParent !== null)
        : [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen, mobile]);

  function closeMenu() {
    setMenuOpen(false);
    if (mobile) window.requestAnimationFrame(() => menuButton.current?.focus());
  }

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        open={menuOpen}
        mobile={mobile}
        onClose={closeMenu}
      />
      {menuOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={closeMenu}
        />
      )}
      <div className="app-frame">
        <button
          ref={menuButton}
          className="mobile-menu"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          aria-controls="primary-sidebar"
        >
          <Menu size={20} />
        </button>
        <TopBar />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}

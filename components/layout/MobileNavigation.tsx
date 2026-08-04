"use client";

import type { RefObject } from "react";
import Link from "next/link";
import { Grid2X2 } from "lucide-react";
import {
  mobilePrimaryItems,
  navigationItemIsActive,
} from "@/components/layout/navigation-config";

export function MobileNavigation({
  pathname,
  menuOpen,
  onOpenMenu,
  menuButtonRef,
  badges,
}: {
  pathname: string;
  menuOpen: boolean;
  onOpenMenu: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  badges: { contacts: number; tasks: number };
}) {
  const primaryActive = mobilePrimaryItems.some((item) =>
    navigationItemIsActive(pathname, item.href),
  );

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      <div className="mobile-bottom-nav-inner">
        {mobilePrimaryItems.map(({ href, label, icon: Icon, badge }) => {
          const active = navigationItemIsActive(pathname, href);
          const count = badge ? badges[badge] : 0;
          return (
            <Link
              href={href}
              className={`mobile-nav-item ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
              key={href}
            >
              <span className="mobile-nav-icon">
                <Icon size={19} strokeWidth={1.9} />
                {count > 0 && <i aria-label={`${count} pending`}>{count > 9 ? "9+" : count}</i>}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          ref={menuButtonRef}
          className={`mobile-nav-item mobile-more-button ${menuOpen || !primaryActive ? "active" : ""}`}
          onClick={onOpenMenu}
          aria-expanded={menuOpen}
          aria-controls="primary-sidebar"
        >
          <span className="mobile-nav-icon"><Grid2X2 size={19} strokeWidth={1.9} /></span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}

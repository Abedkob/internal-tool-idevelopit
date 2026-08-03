"use client";

import { usePathname } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

const titles: Record<string, { title: string; description: string }> = {
  "/dashboard": {
    title: "Dashboard",
    description: "The team's pulse, at a glance.",
  },
  "/contacts": {
    title: "Contacts",
    description: "Relationships, context, and next moves.",
  },
  "/pipeline": {
    title: "Pipeline",
    description: "Move opportunities toward a decision.",
  },
  "/tasks": {
    title: "Tasks",
    description: "The work that keeps momentum moving.",
  },
  "/expenses": {
    title: "Expenses",
    description: "Track where the team's money goes.",
  },
  "/settings": {
    title: "Settings",
    description: "Shape services and spending categories.",
  },
};

export function TopBar() {
  const pathname = usePathname();
  const content = titles[pathname] ?? titles["/dashboard"];
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Team Console</p>
        <h1>{content.title}</h1>
        <p>{content.description}</p>
      </div>
      <div className="topbar-status">
        <SlidersHorizontal size={15} />
        <span>All team data</span>
      </div>
    </header>
  );
}

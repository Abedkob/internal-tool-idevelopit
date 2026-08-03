import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Team Console", template: "%s · Team Console" },
  description: "One shared place for the team's work, pipeline, and spending.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

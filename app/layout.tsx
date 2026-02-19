import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trends Watcher Board",
  description: "AI trends monitoring dashboard - Google Trends & GitHub Trending",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

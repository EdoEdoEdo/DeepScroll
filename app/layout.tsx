import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeepScroll — Historical Documentary Engine",
  description:
    "Scrollytelling documentaries from The Guardian archive, curated by AI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500&family=DM+Serif+Display:ital@0;1&family=Barlow+Condensed:wght@700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

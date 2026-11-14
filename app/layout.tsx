import type { Metadata } from "next";
import { Bebas_Neue, IBM_Plex_Mono, DM_Serif_Display, Barlow_Condensed } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font: no external request, no FOUT
const display = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-display", display: "swap" });
const mono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-mono", display: "swap" });
const serif = DM_Serif_Display({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});
const cond = Barlow_Condensed({ weight: ["700", "900"], subsets: ["latin"], variable: "--font-cond", display: "swap" });

const description = "Scrollytelling documentaries excavated from The Guardian archive, narrated by AI from real articles.";

export const metadata: Metadata = {
  metadataBase: new URL("https://deepscroll.edoedoedo.it"),
  title: "DeepScroll — Historical Documentary Engine",
  description,
  openGraph: {
    title: "DeepScroll — Historical Documentary Engine",
    description,
    url: "/",
    siteName: "DeepScroll",
    type: "website",
    images: [{ url: "/preview.png", width: 3454, height: 1868, alt: "DeepScroll" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DeepScroll — Historical Documentary Engine",
    description,
    images: ["/preview.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable} ${serif.variable} ${cond.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}

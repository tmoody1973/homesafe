import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "./components/SiteHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HomeSafe",
  description:
    "What the City of Boston has on record about a home, with what each record does not prove stated alongside it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme is pinned rather than left to the browser. Unpinned, the page
    // canvas followed prefers-color-scheme into dark while HeroUI's Card kept
    // rendering a light surface, so every card title was white on white. HeroUI
    // reads both the class and the attribute; they must agree.
    <html
      lang="en"
      className={`light ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="light"
    >
      {/* HeroUI's own theme tokens, so the page canvas and its components stay
          in one colour system. See globals.css. */}
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}

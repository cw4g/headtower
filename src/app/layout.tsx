import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Headtower",
  description: "An operator's console for your Headscale tailnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Dark-first: the markup ships the `dark` class as the default, and the inline
  // script below resolves the operator's saved preference (honouring the OS for
  // `system`) before the first paint - so there is no theme flash. The toggle in
  // the top bar flips the class live afterwards. `suppressHydrationWarning` lets
  // the script own the <html> class/style without tripping a hydration mismatch.
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

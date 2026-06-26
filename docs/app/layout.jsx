import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Geist, Geist_Mono } from "next/font/google";
import "nextra-theme-docs/style.css";
import "./globals.css";
import { BeaconMark } from "../components/beacon-mark.jsx";

// Geist for the UI, Geist Mono for code and data - the same typographic pairing
// as the Headtower console, so the docs read as part of the product.
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata = {
  title: {
    default: "Headtower docs",
    template: "%s - Headtower",
  },
  description:
    "Documentation for Headtower, an operator's console for your Headscale tailnet.",
  applicationName: "Headtower",
};

const logo = (
  <span className="ht-logo">
    <BeaconMark style={{ width: 22, height: 22 }} />
    <span className="ht-logo__name">Headtower</span>
    <span className="ht-logo__tag">docs</span>
  </span>
);

const navbar = (
  <Navbar
    logo={logo}
    projectLink="https://github.com/rnihesh/headtower"
  />
);

const footer = (
  <Footer>
    <span>
      Headtower - an operator&apos;s console for Headscale. Independent project;
      not affiliated with Headscale or Tailscale.
    </span>
  </Footer>
);

export default async function RootLayout({ children }) {
  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <Head
        // Beacon amber as the single accent; graphite canvas behind everything.
        color={{ hue: 38, saturation: 90, lightness: { dark: 58, light: 48 } }}
        backgroundColor={{ dark: "#0e1117", light: "#fbfaf8" }}
      >
        <meta name="theme-color" content="#0e1117" />
      </Head>
      <body>
        <Layout
          navbar={navbar}
          footer={footer}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/rnihesh/headtower/tree/main/docs"
          nextThemes={{ defaultTheme: "dark" }}
          editLink={null}
          feedback={{ content: null }}
          sidebar={{ defaultMenuCollapseLevel: 1, toggleButton: true }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}

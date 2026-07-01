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

const SITE_URL = "https://headtower.niheshr.com";
const DESCRIPTION =
  "Documentation for Headtower, an operator's console for your Headscale tailnet.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Headtower docs",
    template: "%s - Headtower",
  },
  description: DESCRIPTION,
  applicationName: "Headtower",
  keywords: [
    "Headscale",
    "Headscale UI",
    "Headscale admin",
    "Headscale web UI",
    "Headscale dashboard",
    "Headscale management",
    "Headscale control panel",
    "Tailscale",
    "tailnet",
    "self-hosted VPN",
    "WireGuard",
    "mesh VPN",
    "admin console",
    "self-hosted",
    "open source",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Headtower",
    title: "Headtower docs",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Headtower docs",
    description: DESCRIPTION,
  },
};

/**
 * Structured data: SoftwareApplication (so a search result can render price/
 * platform/license richly) plus WebSite (one of the real signals Google's
 * algorithm weighs when it decides, on its own timeline, whether to show a
 * sitelinks panel for a site - there's no way to declare sitelinks directly;
 * this plus a clean sitemap.xml/robots.txt and consistent per-page titles are
 * the actual ingredients, not a guarantee). No SearchAction: the docs' search
 * (Pagefind) runs entirely client-side with no queryable URL to point one at,
 * and a fake target would be worse than none.
 */
const JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Headtower",
    description: DESCRIPTION,
    applicationCategory: "SystemAdministrationApplication",
    operatingSystem: "Linux, macOS, Windows (self-hosted via Docker)",
    url: SITE_URL,
    image: `${SITE_URL}/opengraph-image`,
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Headtower",
    description: DESCRIPTION,
    url: SITE_URL,
  },
];

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
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger -- static, hand-authored JSON, no user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
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

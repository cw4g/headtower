const SITE_URL = "https://headtower.niheshr.com";

// Required for `output: "export"`, same as icon.jsx/opengraph-image.jsx.
export const dynamic = "force-static";

export default function robots() {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

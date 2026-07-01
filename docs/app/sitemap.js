const SITE_URL = "https://headtower.niheshr.com";

// Required for `output: "export"`, same as icon.jsx/opengraph-image.jsx.
export const dynamic = "force-static";

/** One entry per real content page - kept in sync with content/_meta.js by hand. */
const PATHS = [
  "",
  "getting-started",
  "concepts",
  "screenshots",
  "configuration",
  "changelog",
  "features",
  "features/machines",
  "features/dashboard",
  "features/access",
  "features/routes",
  "features/settings",
  "features/command-palette",
];

export default function sitemap() {
  // No lastModified: this is a static export with no per-page build
  // timestamp available, and a fake or stale-looking date is worse than
  // omitting the (optional) field entirely.
  return PATHS.map((path) => ({
    url: `${SITE_URL}/${path}`.replace(/\/$/, "") || SITE_URL,
  }));
}

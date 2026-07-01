import nextra from "nextra";

// Nextra 4 (App Router). Content lives in ./content as MDX; the catch-all route
// in app/[[...mdxPath]] renders it. Keep this config lean - branding is applied
// through the theme in app/layout.jsx, not here.
const withNextra = nextra({
  defaultShowCopyCode: true,
});

export default withNextra({
  reactStrictMode: true,
  // Static HTML export: GitHub Pages only serves files, no Node server. The
  // custom domain (headtower.niheshr.com) sits at the root, so no basePath.
  output: "export",
  // Pin the workspace root to this directory so Next never climbs into the
  // Headtower app one level up (there are lockfiles in both places). Keeps the
  // docs build fully self-contained.
  turbopack: {
    root: import.meta.dirname,
  },
});

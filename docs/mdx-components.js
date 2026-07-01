import { useMDXComponents as getThemeComponents } from "nextra-theme-docs";

// Merge the docs theme's MDX components (headings, code, callouts, the page
// wrapper) with any per-render overrides. Required by Nextra 4.
//
// Content images click-to-zoom via medium-zoom (see components/zoom-images.jsx,
// mounted once in app/layout.jsx) rather than a custom `img` override here -
// it scans rendered DOM after the fact, so it needs no special component and
// can't choke on Nextra's local-image object shape the way a naive <img
// src={src}> override did.
const themeComponents = getThemeComponents();

export function useMDXComponents(components) {
  return {
    ...themeComponents,
    ...components,
  };
}

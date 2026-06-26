import { useMDXComponents as getThemeComponents } from "nextra-theme-docs";

// Merge the docs theme's MDX components (headings, code, callouts, the page
// wrapper) with any per-render overrides. Required by Nextra 4.
const themeComponents = getThemeComponents();

export function useMDXComponents(components) {
  return {
    ...themeComponents,
    ...components,
  };
}

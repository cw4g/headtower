import { useMDXComponents as getThemeComponents } from "nextra-theme-docs";
import { LightboxImage } from "./components/lightbox-image.jsx";

// Merge the docs theme's MDX components (headings, code, callouts, the page
// wrapper) with any per-render overrides. Required by Nextra 4.
//
// `img` is overridden globally: every `![]()` in every .mdx page opens full-
// size on click over a blurred backdrop (see ./components/lightbox-image.jsx),
// with zero per-image markup - just write plain markdown images in content.
const themeComponents = getThemeComponents();

export function useMDXComponents(components) {
  return {
    ...themeComponents,
    img: LightboxImage,
    ...components,
  };
}

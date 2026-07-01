import { useMDXComponents as getThemeComponents } from "nextra-theme-docs";

// Merge the docs theme's MDX components (headings, code, callouts, the page
// wrapper) with any per-render overrides. Required by Nextra 4.
//
// `img` is overridden to a PLAIN <img> - nextra-theme-docs wraps every content
// image in its own zoom widget by default (react-medium-image-zoom: a
// "Minimize image" button, an in-place transform-scaled clone). That was
// running at the same time as this project's own medium-zoom setup
// (components/zoom-images.jsx, mounted in app/layout.jsx, matching the old
// VitePress docs' exact zoom UX - click-away/Esc to close, no button) - two
// zoom systems fighting over the same click produced the duplicated/ghosted
// image and the stray button. Only one should run; medium-zoom is the one
// that matches the old docs, so the theme's own wrapper is turned off here.
//
// Nextra resolves a local markdown image into a next/image-style object
// (`{ src, width, height, ... }`), not a plain URL string - unwrap it before
// handing to a native <img>, or the src stringifies to "[object Object]".
function Img({ src, alt, width, height, ...rest }) {
  const resolved = typeof src === "string" ? { src } : src || {};
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer to route through.
    <img
      src={resolved.src ?? ""}
      alt={alt}
      width={width ?? resolved.width}
      height={height ?? resolved.height}
      {...rest}
    />
  );
}

const themeComponents = getThemeComponents();

export function useMDXComponents(components) {
  return {
    ...themeComponents,
    img: Img,
    ...components,
  };
}

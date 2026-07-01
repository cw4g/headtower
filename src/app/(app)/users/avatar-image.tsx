"use client";

import * as React from "react";

export interface AvatarImageProps {
  /** Picture URL, from either Headscale's own OIDC or a matched Headtower account. */
  src: string;
  /** Initial(s) to show if the image is empty or fails to load. */
  fallback: string;
}

/**
 * Round 28px avatar image with an initials fallback.
 *
 * A client component because the broken-image fallback needs `onError`, which
 * a Server Component can't attach to a DOM element directly - the users page
 * that renders this stays a server component otherwise.
 */
export function AvatarImage({ src, fallback }: AvatarImageProps) {
  const [broken, setBroken] = React.useState(false);

  if (broken) {
    return (
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-xs font-medium text-ink-muted"
      >
        {fallback}
      </span>
    );
  }

  return (
    // Avatars come from arbitrary OIDC providers; a plain img avoids
    // per-host remote-image config. Decorative, so alt is empty.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={28}
      height={28}
      loading="lazy"
      // Many OIDC providers (Google, and Pocket ID) 403 avatar requests that
      // carry a Referer. The sidebar avatar sends none for the same reason.
      referrerPolicy="no-referrer"
      className="h-7 w-7 shrink-0 rounded-md border border-line object-cover"
      onError={() => setBroken(true)}
    />
  );
}

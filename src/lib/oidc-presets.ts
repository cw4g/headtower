/**
 * Common OIDC provider presets - a pure, client-safe list (no server imports).
 *
 * Shared by every "add a provider" UI (the legacy Settings > Authentication
 * form and Settings > Identity providers). Selecting one only prefills the
 * Issuer field - it never touches client id or secret. OIDC-discovery
 * compatible providers only, so no GitHub (OAuth2 without a discovery document).
 */

export interface OidcProviderPreset {
  id: string;
  label: string;
  /** Issuer URL to prefill. Blank leaves the field empty for the user to fill in. */
  issuer: string;
  /** Shown under the Issuer field once this preset is selected. */
  hint?: string;
}

export const OIDC_PROVIDER_PRESETS: OidcProviderPreset[] = [
  { id: "google", label: "Google", issuer: "https://accounts.google.com" },
  {
    id: "entra",
    label: "Microsoft Entra",
    issuer: "https://login.microsoftonline.com/<tenant>/v2.0",
    hint: 'Replace <tenant> with your Entra tenant ID, or "common" for multi-tenant apps.',
  },
  {
    id: "okta",
    label: "Okta",
    issuer: "https://YOUR_DOMAIN.okta.com",
    hint: "Replace YOUR_DOMAIN with your Okta org domain.",
  },
  {
    id: "auth0",
    label: "Auth0",
    issuer: "https://YOUR_TENANT.auth0.com",
    hint: "Replace YOUR_TENANT with your Auth0 tenant.",
  },
  {
    id: "pocket-id",
    label: "Pocket ID",
    issuer: "",
    hint: "Self-hosted. Enter your Pocket ID instance's URL, e.g. https://id.example.com.",
  },
  { id: "generic", label: "Generic OIDC", issuer: "" },
];

/** The preset whose issuer exactly matches, if any - used to highlight on load. */
export function matchingOidcPreset(issuer: string): string | null {
  const trimmed = issuer.trim();
  if (!trimmed) return null;
  return (
    OIDC_PROVIDER_PRESETS.find((p) => p.issuer !== "" && p.issuer === trimmed)?.id ?? null
  );
}

import type { ReactNode } from "react";
import { KeySquare } from "lucide-react";
import { cookies } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { requireSession, type Session } from "@/lib/auth";
import { loadSession } from "@/lib/auth/session";
import { db, session as sessionTable } from "@/lib/db";
import { personalApiKey } from "@/lib/db/schema";
import { ROLE_LABELS } from "@/lib/rbac";
import { THEME_COOKIE, normalizeTheme } from "@/lib/theme";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Table, TableBody, TableHead, Th, Tr } from "@/components/ui/table";
import {
  ACCENT_COOKIE,
  FONT_SIZE_COOKIE,
  normalizeAccent,
  normalizeFontSize,
} from "./appearance";
import { AppearanceForm } from "./appearance-form";
import {
  CreatePersonalApiKeyDialog,
  PersonalApiKeyRow,
  type PersonalApiKeyRowData,
} from "./personal-api-keys";
import { SessionRow, SignOutOthersButton, type SessionRowData } from "./sessions-list";

// Sessions and keys are live, per-account DB state; never prebuild this view.
export const dynamic = "force-dynamic";

/**
 * The self-service Account page: a read-only identity readout, personal
 * display preferences, this account's own sessions (view + revoke, including
 * bulk "sign out everywhere else" - the self-service gap this page closes),
 * and its own personal API keys (mint / list / revoke). Every mutation here
 * only requires an authenticated session, not an RBAC capability - see
 * `./actions`' doc comment for why managing your own data needs no gate.
 *
 * Sessions and personal API keys are both OIDC-only concepts: single-operator
 * (API-key) mode has no `app_user` row to own either, so both sections render
 * a short explanatory note there instead of an empty list.
 */
export default async function AccountPage() {
  const authSession = await requireSession();
  const isOidc = authSession.user.method === "oidc";

  let sessionRows: SessionRowData[] = [];
  let otherSessionCount = 0;
  if (isOidc) {
    const loaded = await loadSession();
    const rows = await db
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.userId, authSession.user.id))
      .orderBy(desc(sessionTable.createdAt));

    sessionRows = rows
      .map((row) => ({
        id: row.id,
        isCurrent: row.id === loaded?.sessionId,
        created: formatDate(row.createdAt),
        expires: formatDate(row.expiresAt),
      }))
      // This device leads the list regardless of when it was created.
      .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
    otherSessionCount = sessionRows.filter((row) => !row.isCurrent).length;
  }

  let keyRows: PersonalApiKeyRowData[] = [];
  if (isOidc) {
    const rows = await db
      .select()
      .from(personalApiKey)
      .where(eq(personalApiKey.userId, authSession.user.id))
      .orderBy(desc(personalApiKey.createdAt));

    keyRows = rows.map((row) => ({
      id: row.id,
      name: row.name,
      created: formatDate(row.createdAt),
      expires: row.expiresAt ? formatDate(row.expiresAt) : null,
      lastUsed: row.lastUsedAt ? formatDate(row.lastUsedAt) : null,
    }));
  }

  // Seed the appearance form from the saved cookies so the first paint here
  // matches the last choice - the same trick the sidebar uses for the theme
  // (see AppShell). Falls back to each default when unset/garbage.
  const cookieStore = await cookies();
  const initialTheme = normalizeTheme(cookieStore.get(THEME_COOKIE)?.value);
  const initialAccent = normalizeAccent(cookieStore.get(ACCENT_COOKIE)?.value);
  const initialFontSize = normalizeFontSize(cookieStore.get(FONT_SIZE_COOKIE)?.value);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Console"
        title="Account"
        description="Your identity, sessions, and personal API keys."
      />

      <AccountCard authSession={authSession} />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardBody>
          <AppearanceForm
            initialTheme={initialTheme}
            initialAccent={initialAccent}
            initialFontSize={initialFontSize}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          {isOidc && <SignOutOthersButton otherCount={otherSessionCount} />}
        </CardHeader>
        {!isOidc ? (
          <CardBody>
            <p className="text-xs text-ink-muted">
              Session tracking applies to OIDC sign-in. Single-operator mode has
              no per-device sessions to list.
            </p>
          </CardBody>
        ) : (
          <Table>
            <TableHead>
              <Tr className="hover:bg-transparent">
                <Th className="pl-4">Session</Th>
                <Th>Created</Th>
                <Th align="right">Expires</Th>
                <Th className="pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </TableHead>
            <TableBody>
              {sessionRows.map((row) => (
                <SessionRow key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal API keys</CardTitle>
          {isOidc && keyRows.length > 0 && <CreatePersonalApiKeyDialog />}
        </CardHeader>
        {!isOidc ? (
          <CardBody>
            <p className="text-xs text-ink-muted">
              Personal API keys belong to an OIDC account. Single-operator mode
              has no account to mint one against.
            </p>
          </CardBody>
        ) : keyRows.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={KeySquare}
              title="No personal API keys"
              description="Preview: keys can be minted and revoked here, but Headtower does not enforce them yet, so one grants no access. The secret is shown once, at creation."
              action={<CreatePersonalApiKeyDialog />}
            />
          </CardBody>
        ) : (
          <Table>
            <TableHead>
              <Tr className="hover:bg-transparent">
                <Th className="pl-4">Name</Th>
                <Th>Created</Th>
                <Th align="right">Expires</Th>
                <Th align="right">Last used</Th>
                <Th className="pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </TableHead>
            <TableBody>
              {keyRows.map((entry) => (
                <PersonalApiKeyRow key={entry.id} entry={entry} />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/** Read-only identity readout: name, email, avatar, role, sign-in method. */
function AccountCard({ authSession }: { authSession: Session }) {
  const { user, role } = authSession;
  const methodLabel = user.method === "oidc" ? "OIDC" : "API key";
  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <div className="flex flex-col divide-y divide-line">
        <div className="flex items-center gap-3 px-4 py-3">
          {user.picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- external IdP avatar, no static optimization.
            <img
              src={user.picture}
              alt=""
              referrerPolicy="no-referrer"
              className="h-12 w-12 shrink-0 rounded-full border border-line object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-base font-medium text-ink-muted">
              {initial}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
            {user.email && (
              <p className="data truncate text-xs text-ink-faint">{user.email}</p>
            )}
          </div>
        </div>

        <ReadoutRow label="Role">
          <Chip variant="beacon" mono>
            {ROLE_LABELS[role]}
          </Chip>
        </ReadoutRow>

        <ReadoutRow label="Sign-in method">
          <span className="text-sm text-ink">{methodLabel}</span>
        </ReadoutRow>

        <ReadoutRow label="Identity">
          <span className="text-xs text-ink-faint">
            From your sign-in provider - not editable here.
          </span>
        </ReadoutRow>
      </div>
    </Card>
  );
}

function ReadoutRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-40 shrink-0 text-[11px] uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Render a timestamp as a UTC date (YYYY-MM-DD) plus a full ISO title. */
function formatDate(date: Date): { label: string; title: string } {
  return { label: date.toISOString().slice(0, 10), title: date.toISOString() };
}

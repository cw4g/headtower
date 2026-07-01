import { UsersRound } from "lucide-react";
import { appUser, db, type AppUser } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sessionCan } from "@/lib/authz";
import { ROLES, ROLE_LABELS } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableHead, Th, Tr } from "@/components/ui/table";
import { MemberRow } from "./member-row";

const ROLE_OPTIONS = ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }));

// Membership is live account state; never prebuild this view.
export const dynamic = "force-dynamic";

/**
 * Who can sign in to this Headtower console and what role they hold. Distinct
 * from Settings > Identity providers (which controls HOW someone signs in) -
 * this is WHO, once they have. Changing a role or removing an account both
 * require `members.manage` (owner-only by default); a session without it sees
 * the list read-only.
 */
export default async function MembersPage() {
  const session = await getSession();
  const canManage = await sessionCan("members.manage");

  let members: AppUser[] = [];
  try {
    members = await db.select().from(appUser).all();
  } catch {
    members = [];
  }
  members.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-ink">
          Members
        </h2>
        <p className="text-sm text-ink-muted">
          Every account that can sign in to this console, and the role it holds.
        </p>
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No accounts yet"
          description="Accounts appear here once someone signs in through single sign-on."
        />
      ) : (
        <Card>
          <Table>
            <TableHead>
              <Tr className="hover:bg-transparent">
                <Th className="pl-4">Account</Th>
                <Th>Role</Th>
                <Th>Last sign-in</Th>
                <Th className="pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </TableHead>
            <TableBody>
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isSelf={member.id === session?.user.id}
                  canManage={canManage}
                  roleOptions={ROLE_OPTIONS}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

"use server";

/**
 * Server Actions for Settings > Members.
 *
 * Changes another account's role. Gated on `members.manage` (owner-only per
 * the current role map) and protected against the one lockout scenario that
 * matters: demoting the last remaining owner, which would leave the console
 * with nobody able to manage roles or settings ever again.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { appUser, db, sqlite } from "@/lib/db";
import { isRole, type Role } from "@/lib/rbac";
import { audit, authorize } from "@/lib/authz";

const PATH = "/settings/members";

export type UpdateRoleState =
  | { status: "success" }
  | { status: "error"; error: string };

/** Change a member's role. Refuses to demote the last owner. */
export async function updateMemberRole(
  memberId: string,
  role: string,
): Promise<UpdateRoleState> {
  const gate = await authorize("members.manage");
  if (!gate.ok) return { status: "error", error: gate.reason };

  if (!isRole(role)) {
    return { status: "error", error: "Unknown role." };
  }
  const nextRole: Role = role;

  const target = await db.select().from(appUser).where(eq(appUser.id, memberId)).get();
  if (!target) {
    return { status: "error", error: "That account no longer exists." };
  }

  if (target.role === "owner" && nextRole !== "owner") {
    // Atomic last-owner guard: count-and-demote in one statement so two
    // concurrent demotions of the two remaining owners can't both pass a
    // separate check and leave the console with zero owners (an unrecoverable
    // lockout, since only `owner` holds `members.manage`). SQLite runs a single
    // statement atomically; a 0-row result means the guard fired.
    const res = sqlite
      .prepare(
        `UPDATE app_user SET role = ?
           WHERE id = ? AND role = 'owner'
             AND (SELECT count(*) FROM app_user WHERE role = 'owner') > 1`,
      )
      .run(nextRole, memberId);
    if (res.changes === 0) {
      return {
        status: "error",
        error: "Can't demote the only owner - promote someone else first.",
      };
    }
  } else {
    await db.update(appUser).set({ role: nextRole }).where(eq(appUser.id, memberId));
  }

  await audit(gate.session, {
    action: "member.role_change",
    targetType: "user",
    targetId: memberId,
    targetName: target.name,
    detail: { from: target.role, to: nextRole },
  });
  revalidatePath(PATH);
  return { status: "success" };
}

/** Remove a member's account entirely. Refuses to remove the last owner. */
export async function removeMember(memberId: string): Promise<UpdateRoleState> {
  const gate = await authorize("members.manage");
  if (!gate.ok) return { status: "error", error: gate.reason };

  const target = await db.select().from(appUser).where(eq(appUser.id, memberId)).get();
  if (!target) {
    return { status: "error", error: "That account no longer exists." };
  }
  if (memberId === gate.session.user.id) {
    return { status: "error", error: "Can't remove your own account here." };
  }

  if (target.role === "owner") {
    // Atomic last-owner guard, same reasoning as updateMemberRole: count-and-
    // delete in one statement so concurrent owner removals can't both slip
    // past a separate check and empty the owner role.
    const res = sqlite
      .prepare(
        `DELETE FROM app_user
           WHERE id = ? AND role = 'owner'
             AND (SELECT count(*) FROM app_user WHERE role = 'owner') > 1`,
      )
      .run(memberId);
    if (res.changes === 0) {
      return { status: "error", error: "Can't remove the only owner." };
    }
  } else {
    await db.delete(appUser).where(eq(appUser.id, memberId));
  }

  await audit(gate.session, {
    action: "member.remove",
    targetType: "user",
    targetId: memberId,
    targetName: target.name,
  });
  revalidatePath(PATH);
  return { status: "success" };
}

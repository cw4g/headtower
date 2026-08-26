/**
 * One saved policy revision's document body (Route Handler).
 *
 * The History list carries no document text on purpose: a hundred revisions
 * should cost a hundred rows, not a megabyte of policy in the client payload.
 * The body is fetched here when the operator actually asks to diff or load one.
 *
 * Route Handlers get no layout and therefore no route-group gate, so the
 * capability is checked explicitly - `acls.read`, the same one the Access view
 * itself requires.
 */

import { NextResponse } from "next/server";
import { sessionCan } from "@/lib/authz";
import { getRevision } from "@/lib/db";

// Reads live local state; never cache or prerender.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await sessionCan("acls.read"))) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return NextResponse.json({ error: "Bad revision id." }, { status: 400 });
  }

  const revision = await getRevision(numeric);
  if (!revision) {
    return NextResponse.json({ error: "No such revision." }, { status: 404 });
  }

  return NextResponse.json({
    id: revision.id,
    digest: revision.digest,
    document: revision.document,
  });
}

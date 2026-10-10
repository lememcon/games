import type { MutationResult, Role, UserRow } from "./types";
import { isRecord } from "./validate";

/** Kelsin and Waymost: always approved admins, whatever the database says. */
export const PROTECTED_ADMIN_IDS: readonly string[] = [
  "71449887429894144",
  "560653672485486592",
];

export const isProtected = (discordId: string) =>
  PROTECTED_ADMIN_IDS.includes(discordId);

const PENDING_MEMBER: UserRow = { role: "member", status: "pending" };

/** The role and status that apply, ignoring a missing or tampered row for built-ins. */
export function effectiveUser(discordId: string, row: UserRow | null): UserRow {
  if (isProtected(discordId)) return { role: "admin", status: "approved" };
  const { role, status } = row ?? PENDING_MEMBER;
  return { role, status };
}

export interface Change {
  status?: "approved";
  role?: Role;
}

const refuse = (status: 400 | 403 | 404 | 409, error: string) =>
  ({ ok: false, status, error }) as const;

function parseChange(body: unknown): Change | null {
  if (!isRecord(body)) return null;
  const entries = Object.entries(body);
  if (entries.length === 0) return null;
  const change: Change = {};
  for (const [key, value] of entries) {
    if (key === "status" && value === "approved") change.status = value;
    else if (key === "role" && (value === "member" || value === "admin"))
      change.role = value;
    else return null;
  }
  return change;
}

/**
 * Checks that `actor` may act on `target`. Order matters: actor, id shape,
 * built-in lock (409 before any 404), then existence.
 */
function checkTarget(
  actor: UserRow,
  targetId: string,
  target: UserRow | null,
): MutationResult<UserRow> {
  if (actor.role !== "admin" || actor.status !== "approved")
    return refuse(403, "forbidden");
  if (!/^\d{15,25}$/.test(targetId)) return refuse(400, "invalid_id");
  if (isProtected(targetId)) return refuse(409, "locked");
  if (!target) return refuse(404, "not_found");
  return { ok: true, value: target };
}

/** `actor` and `target` are the effective users; `target` is null when unknown. */
export function validateChange(
  actor: UserRow,
  targetId: string,
  target: UserRow | null,
  body: unknown,
): MutationResult<Change> {
  const checked = checkTarget(actor, targetId, target);
  if (!checked.ok) return checked;
  const change = parseChange(body);
  if (!change) return refuse(400, "invalid_body");
  if (change.role && checked.value.status !== "approved")
    return refuse(400, "approve_first");
  if (change.status && change.role) return refuse(400, "invalid_body");
  return { ok: true, value: change };
}

export function validateRemove(
  actor: UserRow,
  targetId: string,
  target: UserRow | null,
): MutationResult<null> {
  const checked = checkTarget(actor, targetId, target);
  return checked.ok ? { ok: true, value: null } : checked;
}

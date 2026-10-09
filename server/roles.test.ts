import { describe, expect, it } from "vitest";

import {
  PROTECTED_ADMIN_IDS,
  effectiveUser,
  validateChange,
  validateRemove,
} from "./roles";
import type { UserRow } from "./types";

const admin: UserRow = { role: "admin", status: "approved" };
const member: UserRow = { role: "member", status: "approved" };
const pending: UserRow = { role: "member", status: "pending" };
const OTHER = "998877665544332211";
const [KELSIN, WAYMOST] = PROTECTED_ADMIN_IDS;

describe("effectiveUser", () => {
  it.each([null, member, pending, { role: "member", status: "pending" }])(
    "makes built-in ids approved admins for row %j",
    (row) => {
      for (const id of PROTECTED_ADMIN_IDS)
        expect(effectiveUser(id, row as UserRow | null)).toEqual(admin);
    },
  );

  it("passes other rows through", () => {
    expect(effectiveUser(OTHER, member)).toEqual(member);
  });

  it("treats an unknown id as a pending member", () => {
    expect(effectiveUser(OTHER, null)).toEqual(pending);
  });
});

describe("validateChange", () => {
  const run = (body: unknown, target: UserRow | null = member, id = OTHER) =>
    validateChange(admin, id, target, body);

  it("allows approving a pending user", () => {
    expect(run({ status: "approved" }, pending)).toEqual({
      ok: true,
      value: { status: "approved" },
    });
  });

  it("allows promoting and demoting an approved user", () => {
    expect(run({ role: "admin" })).toEqual({
      ok: true,
      value: { role: "admin" },
    });
    expect(run({ role: "member" }, admin)).toEqual({
      ok: true,
      value: { role: "member" },
    });
  });

  it("lets an admin demote themselves", () => {
    expect(validateChange(admin, OTHER, admin, { role: "member" }).ok).toBe(
      true,
    );
  });

  it.each([KELSIN, WAYMOST])("locks built-in admin %s", (id) => {
    expect(run({ role: "member" }, admin, id)).toEqual({
      ok: false,
      status: 409,
      error: "locked",
    });
  });

  it("answers 409 before 404 for a built-in id with no row", () => {
    expect(run({ role: "member" }, null, KELSIN)).toMatchObject({
      status: 409,
    });
  });

  it("answers 404 for an unknown target", () => {
    expect(run({ role: "member" }, null)).toMatchObject({ status: 404 });
  });

  it("rejects a malformed id", () => {
    expect(run({ role: "member" }, member, "abc")).toMatchObject({
      status: 400,
      error: "invalid_id",
    });
  });

  it("rejects promoting or changing the role of a pending user", () => {
    expect(run({ role: "admin" }, pending)).toMatchObject({
      status: 400,
      error: "approve_first",
    });
    expect(run({ role: "member" }, pending)).toMatchObject({
      error: "approve_first",
    });
  });

  it.each([
    ["unknown key", { status: "approved", extra: 1 }],
    ["only an unknown key", { name: "x" }],
    ["empty object", {}],
    ["bad role", { role: "owner" }],
    ["bad status", { status: "pending" }],
    ["status and role together", { status: "approved", role: "member" }],
    ["an array", []],
    ["null", null],
    ["a string", "approved"],
  ])("rejects a body with %s", (_label, body) => {
    expect(run(body)).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects a non-admin or unapproved actor", () => {
    expect(validateChange(member, OTHER, member, { role: "admin" })).toEqual({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    expect(
      validateChange({ role: "admin", status: "pending" }, OTHER, member, {
        role: "admin",
      }),
    ).toMatchObject({ status: 403 });
  });
});

describe("validateRemove", () => {
  it("allows removing a regular user, including yourself", () => {
    expect(validateRemove(admin, OTHER, pending)).toEqual({
      ok: true,
      value: null,
    });
    expect(validateRemove(admin, OTHER, admin).ok).toBe(true);
  });

  it("refuses built-ins, missing targets and non-admin actors", () => {
    expect(validateRemove(admin, KELSIN, null)).toMatchObject({ status: 409 });
    expect(validateRemove(admin, OTHER, null)).toMatchObject({ status: 404 });
    expect(validateRemove(member, OTHER, member)).toMatchObject({
      status: 403,
    });
  });
});

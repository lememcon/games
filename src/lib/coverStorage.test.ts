import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  describeStorageError,
  isComplete,
  isEdited,
  sourceLabel,
  toForm,
  toInput,
} from "@/lib/coverStorage";
import type { CoverStorageInfo } from "@/types";

const INFO: CoverStorageInfo = {
  source: "admin",
  configured: true,
  bucket: "covers",
  region: "us-east-1",
  endpoint: null,
  coverBaseUrl: "https://cdn.example.com",
  accessKeyId: "••••AB12",
  secretSet: true,
  updatedAt: "2026-01-01",
};

describe("coverStorage form", () => {
  it("prefills non-secret fields and leaves the key id and secret blank", () => {
    expect(toForm(INFO)).toEqual({
      bucket: "covers",
      region: "us-east-1",
      endpoint: "",
      coverBaseUrl: "https://cdn.example.com",
      accessKeyId: "",
      secretAccessKey: "",
    });
  });

  it("converts to input, trimming and omitting blank optional fields", () => {
    const form = {
      ...toForm(INFO),
      accessKeyId: " AKIA ",
      secretAccessKey: "  ",
    };
    expect(toInput(form)).toEqual({
      bucket: "covers",
      region: "us-east-1",
      coverBaseUrl: "https://cdn.example.com",
      accessKeyId: "AKIA",
    });
    expect(
      toInput({
        ...form,
        endpoint: " https://s3.example.com ",
        secretAccessKey: "s",
      }),
    ).toMatchObject({
      endpoint: "https://s3.example.com",
      secretAccessKey: "s",
    });
  });

  it("detects edits and completeness", () => {
    const saved = toForm(INFO);
    expect(isEdited(saved, saved)).toBe(false);
    expect(isEdited({ ...saved, bucket: "other" }, saved)).toBe(true);
    expect(isComplete(saved)).toBe(false);
    expect(isComplete({ ...saved, accessKeyId: "AKIA" })).toBe(true);
  });

  it("labels the source", () => {
    expect(sourceLabel("admin")).toBe("Saved here");
    expect(sourceLabel("env")).toBe("Server environment");
    expect(sourceLabel("none")).toBe("Not set");
  });
});

describe("describeStorageError", () => {
  const err = (status: number, message: string, body: unknown = null) =>
    new ApiError(status, message, body);

  it.each([
    [err(401, "x"), /admin access/],
    [err(429, "cooldown"), /few seconds/],
    [err(409, "busy"), /already running/],
    [
      err(400, "invalid_storage", { field: "bucket" }),
      /bucket name isn't valid/,
    ],
    [
      err(400, "invalid_storage", {
        field: "secretAccessKey",
        code: "secret_required",
      }),
      /Enter the secret/,
    ],
    [err(400, "invalid_storage", { field: "body" }), /rejected/],
    [err(400, "invalid_storage"), /rejected/],
    [err(500, "boom"), /Something went wrong/],
    [new Error("x"), /Something went wrong/],
  ])("explains %#", (e, expected) => {
    expect(describeStorageError(e)).toMatch(expected);
  });
});

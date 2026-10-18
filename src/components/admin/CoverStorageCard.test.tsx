import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CoverStorageCard from "@/components/admin/CoverStorageCard";
import { renderWithMantine } from "@/test/utils";
import type { CoverStorageInfo, CoverStorageTest } from "@/types";

const hook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/hooks/useCoverStorage", () => ({ default: () => hook.value }));

const SAVED: CoverStorageInfo = {
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
const NONE: CoverStorageInfo = {
  source: "none",
  configured: false,
  bucket: null,
  region: null,
  endpoint: null,
  coverBaseUrl: null,
  accessKeyId: null,
  secretSet: false,
  updatedAt: null,
};

const fns = {
  save: vi.fn(),
  clear: vi.fn(),
  test: vi.fn(),
};

const setup = (over: Record<string, unknown> = {}) => {
  hook.value = {
    info: SAVED,
    loading: false,
    error: false,
    actionError: null,
    testing: false,
    testResult: null,
    ...fns,
    ...over,
  };
  renderWithMantine(<CoverStorageCard />);
};

const fill = async (label: string, text: string) => {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  await userEvent.type(input, text);
};

describe("CoverStorageCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows loading and load failure", () => {
    setup({ loading: true });
    expect(screen.getByText(/Loading cover storage/)).toBeInTheDocument();
  });

  it("shows a load failure", () => {
    setup({ info: null, error: true });
    expect(screen.getByText(/Couldn't load cover storage/)).toBeInTheDocument();
  });

  it("shows the source, masked key id and saved secret hint", () => {
    setup();
    expect(screen.getByText("Saved here")).toBeInTheDocument();
    expect(screen.getByText("••••AB12")).toBeInTheDocument();
    expect(screen.getByLabelText("Bucket")).toHaveValue("covers");
    expect(screen.getByLabelText("Secret access key")).toHaveAttribute(
      "placeholder",
      expect.stringMatching(/Saved/),
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("flags unreadable settings and disables testing when nothing is set", () => {
    setup({ info: { ...NONE, unreadable: true } });
    expect(screen.getByText(/can no longer be read/)).toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test storage" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Remove override" }),
    ).not.toBeInTheDocument();
  });

  it("tests the saved settings when unedited", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Test storage" }));
    expect(fns.test).toHaveBeenCalledWith(undefined);
  });

  it("tests and saves the edited form", async () => {
    setup();
    await fill("Access key id", "AKIA");
    await fill("Endpoint (optional)", "https://s3.example.com");
    await userEvent.click(screen.getByRole("button", { name: "Test storage" }));
    const expected = {
      bucket: "covers",
      region: "us-east-1",
      endpoint: "https://s3.example.com",
      coverBaseUrl: "https://cdn.example.com",
      accessKeyId: "AKIA",
    };
    expect(fns.test).toHaveBeenCalledWith(expected);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(fns.save).toHaveBeenCalledWith(expected);
  });

  it("keeps testing disabled while required fields are missing", async () => {
    setup({ info: NONE });
    await fill("Bucket", "covers");
    expect(screen.getByRole("button", { name: "Test storage" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("removes the override", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove override" }),
    );
    expect(fns.clear).toHaveBeenCalled();
  });

  it("shows errors, test results and warnings", () => {
    const testResult: CoverStorageTest = {
      ok: true,
      status: "ok",
      message: "Storage works.",
      warning: "Bucket is public.",
    };
    setup({ actionError: "Something broke", testResult });
    expect(screen.getByRole("alert")).toHaveTextContent("Something broke");
    expect(screen.getByRole("status")).toHaveTextContent("Storage works.");
    expect(screen.getByRole("status")).toHaveTextContent("Bucket is public.");
  });

  it("shows a failed test without a warning", () => {
    setup({
      testResult: { ok: false, status: "denied", message: "Access denied." },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Access denied.");
  });
});

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import BggKeyCard from "@/components/admin/BggKeyCard";
import { renderWithMantine } from "@/test/utils";
import type { BggKeyInfo, BggKeyTest } from "@/types";

const SET: BggKeyInfo = {
  configured: true,
  masked: "••••••••ab12",
  updatedAt: "2026-01-01",
};
const UNSET: BggKeyInfo = { configured: false, masked: null, updatedAt: null };

const setup = (
  info: BggKeyInfo,
  over: {
    testResult?: BggKeyTest | null;
    error?: string | null;
    onSave?: () => Promise<boolean>;
  } = {},
) => {
  const props = {
    info,
    testing: false,
    testResult: over.testResult ?? null,
    error: over.error ?? null,
    onSave: vi.fn(over.onSave ?? (async () => true)),
    onRemove: vi.fn(),
    onTest: vi.fn(),
  };
  renderWithMantine(<BggKeyCard {...props} />);
  return props;
};

describe("BggKeyCard", () => {
  it("shows a configured key as masked only", () => {
    setup(SET);
    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getByText("••••••••ab12")).toBeInTheDocument();
  });

  it("shows not set, with testing disabled until something is typed", () => {
    setup(UNSET);
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test key" })).toBeDisabled();
  });

  it("flags an unreadable stored key", () => {
    setup({ ...UNSET, unreadable: true });
    expect(screen.getByText("Unreadable")).toBeInTheDocument();
    expect(screen.getByText(/Enter it again/)).toBeInTheDocument();
  });

  it("tests the stored key", async () => {
    const p = setup(SET);
    await userEvent.click(screen.getByRole("button", { name: "Test key" }));
    expect(p.onTest).toHaveBeenCalledWith(undefined);
  });

  it("saves a typed key and closes the editor", async () => {
    const p = setup(UNSET);
    await userEvent.click(screen.getByRole("button", { name: "Set key" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("New key"), "abc123");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(p.onSave).toHaveBeenCalledWith("abc123");
    expect(screen.queryByLabelText("New key")).not.toBeInTheDocument();
  });

  it("keeps the editor open when saving fails", async () => {
    setup(SET, { onSave: async () => false });
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.type(screen.getByLabelText("New key"), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByLabelText("New key")).toHaveValue("abc");
  });

  it("tests a typed candidate and can cancel editing", async () => {
    const p = setup(UNSET);
    await userEvent.click(screen.getByRole("button", { name: "Set key" }));
    await userEvent.type(screen.getByLabelText("New key"), "cand");
    await userEvent.click(screen.getByRole("button", { name: "Test key" }));
    expect(p.onTest).toHaveBeenCalledWith("cand");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("New key")).not.toBeInTheDocument();
  });

  it("removes the key", async () => {
    const p = setup(SET);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(p.onRemove).toHaveBeenCalled();
  });

  it("shows test results and errors", () => {
    setup(SET, {
      testResult: { ok: false, status: "invalid", message: "Rejected." },
      error: "Something broke",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Rejected.");
    expect(screen.getByRole("alert")).toHaveTextContent("Something broke");
  });

  it("shows a successful test", () => {
    setup(SET, {
      testResult: { ok: true, status: "valid", message: "The key works." },
    });
    expect(screen.getByRole("status")).toHaveTextContent("The key works.");
  });
});

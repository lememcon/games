import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@mantine/core";

import Header from "@/components/Header";
import { renderWithMantine } from "@/test/utils";
import type { ApprovedUser } from "@/types";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ signOut }));

const member: ApprovedUser = {
  discordId: "1",
  name: "Sam",
  image: null,
  role: "member",
};

const renderHeader = (props: Partial<ComponentProps<typeof Header>> = {}) =>
  renderWithMantine(
    <AppShell header={{ height: 60 }}>
      <Header
        year="2025"
        years={["2025", "2026"]}
        onYearChange={() => {}}
        {...props}
      />
    </AppShell>,
  );

describe("Header", () => {
  it("omits the year picker when no years are given", () => {
    const { queryByRole } = renderHeader({ years: undefined });
    expect(queryByRole("textbox")).toBeNull();
  });

  it("shows the current year in the selector", () => {
    const { getByRole } = renderHeader();
    expect(getByRole("textbox")).toHaveValue("2025");
  });

  it("fires onYearChange when a different year is picked", async () => {
    const user = userEvent.setup();
    const onYearChange = vi.fn();
    const { getByRole, getByText } = renderHeader({ onYearChange });

    await user.click(getByRole("textbox"));
    await user.click(getByText("2026"));

    expect(onYearChange).toHaveBeenCalledWith("2026", expect.anything());
  });

  it("links the logo and title home", () => {
    const { getByRole } = renderHeader();
    const link = getByRole("link", { name: "LememCon home" });
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveTextContent("LememCon");
  });

  it("has no account menu without a user", () => {
    const { queryByLabelText } = renderHeader();
    expect(queryByLabelText("Account menu")).toBeNull();
  });

  describe("account menu", () => {
    afterEach(() => vi.clearAllMocks());

    it("hides the Admin link from members", async () => {
      const { getByLabelText, findByText, queryByText } = renderHeader({
        user: member,
      });
      await userEvent.click(getByLabelText("Account menu"));

      expect(await findByText("Sign out")).toBeInTheDocument();
      expect(queryByText("Admin")).toBeNull();
    });

    it("links admins to /admin", async () => {
      const { getByLabelText, findByRole } = renderHeader({
        user: { ...member, role: "admin" },
      });
      await userEvent.click(getByLabelText("Account menu"));

      expect(
        await findByRole("menuitem", { name: "Admin", hidden: true }),
      ).toHaveAttribute("href", "/admin");
    });

    it("signs out and reloads", async () => {
      const reload = vi.fn();
      vi.stubGlobal("location", { ...window.location, reload });
      signOut.mockResolvedValue(undefined);
      const { getByLabelText, findByText } = renderHeader({ user: member });
      await userEvent.click(getByLabelText("Account menu"));
      await userEvent.click(await findByText("Sign out"));

      expect(reload).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("surfaces a sign-out failure", async () => {
      signOut.mockRejectedValue(new Error("x"));
      const { getByLabelText, findByText, findByRole } = renderHeader({
        user: member,
      });
      await userEvent.click(getByLabelText("Account menu"));
      await userEvent.click(await findByText("Sign out"));

      expect(await findByRole("alert", { hidden: true })).toHaveTextContent(
        /Couldn.t sign out/,
      );
    });
  });
});

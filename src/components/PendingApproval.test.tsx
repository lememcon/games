import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import PendingApproval from "@/components/PendingApproval";
import { headValue, resetHead } from "@/test/head";
import { renderWithMantine } from "@/test/utils";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ signOut }));

describe("PendingApproval", () => {
  afterEach(() => vi.clearAllMocks());

  it("greets the user and offers Check again", async () => {
    const onCheckAgain = vi.fn();
    renderWithMantine(
      <PendingApproval name="Sam" onCheckAgain={onCheckAgain} />,
    );

    expect(screen.getByText(/Hi Sam/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(onCheckAgain).toHaveBeenCalled();
  });

  it("renders on the floating-covers backdrop", async () => {
    const { container } = renderWithMantine(
      <PendingApproval name="Sam" onCheckAgain={() => {}} />,
    );
    expect(container.querySelector(".cover-page")).not.toBeNull();
    await waitFor(() =>
      expect(container.querySelector(".floaters")).not.toBeNull(),
    );
    const card = container.querySelector(".cover-card") as HTMLElement;
    expect(card).toContainElement(screen.getByRole("heading", { level: 2 }));
    expect(card).toContainElement(
      screen.getByRole("button", { name: "Check again" }),
    );
  });

  it("disables Check again while checking", () => {
    renderWithMantine(
      <PendingApproval name="Sam" onCheckAgain={() => {}} checking />,
    );
    expect(screen.getByRole("button", { name: "Check again" })).toBeDisabled();
  });

  it("signs out and reloads", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    signOut.mockResolvedValue(undefined);
    renderWithMantine(<PendingApproval name="Sam" onCheckAgain={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it("surfaces a sign-out failure", async () => {
    signOut.mockRejectedValue(new Error("x"));
    renderWithMantine(<PendingApproval name="Sam" onCheckAgain={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Couldn.t sign out/,
    );
  });
});

afterEach(resetHead);

describe("PendingApproval page metadata", () => {
  it("titles the page and claims no canonical", () => {
    renderWithMantine(<PendingApproval name="Sam" onCheckAgain={vi.fn()} />);
    expect(document.title).toBe("Waiting for approval | Lememcon Games");
    expect(headValue('link[rel="canonical"]', "href")).toBeNull();
  });
});

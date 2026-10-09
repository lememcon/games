import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import SignIn from "@/components/SignIn";
import { renderWithMantine } from "@/test/utils";

const signInWithDiscord = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ signInWithDiscord }));

describe("SignIn", () => {
  afterEach(() => vi.clearAllMocks());

  it("redirects to the URL returned by the server", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", {
      ...window.location,
      set href(v: string) {
        assign(v);
      },
    });
    signInWithDiscord.mockResolvedValue("https://discord.test/auth");
    renderWithMantine(<SignIn />);

    await userEvent.click(
      screen.getByRole("button", { name: "Sign in with Discord" }),
    );

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://discord.test/auth"),
    );
    vi.unstubAllGlobals();
  });

  it("shows an error when sign-in cannot start", async () => {
    signInWithDiscord.mockRejectedValue(new Error("nope"));
    renderWithMantine(<SignIn />);

    await userEvent.click(
      screen.getByRole("button", { name: "Sign in with Discord" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Couldn.t start sign-in/,
    );
  });
});

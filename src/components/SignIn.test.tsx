import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import SignIn from "@/components/SignIn";
import { renderWithMantine } from "@/test/utils";

const signInWithDiscord = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  signInWithDiscord,
}));

describe("SignIn", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders the heading and a Discord button with a decorative icon", () => {
    renderWithMantine(<SignIn />);

    expect(
      screen.getByRole("heading", { name: "Sign in to LememCon" }),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Sign in with Discord" });
    expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it("frames the large logo", () => {
    const { container } = renderWithMantine(<SignIn />);
    expect(container.querySelector('img[alt=""]')).toHaveClass(
      "tray-logo",
      "tray-logo--lg",
    );
  });

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

  describe("with an error code", () => {
    it.each([
      ["state_mismatch", /took too long/],
      ["access_denied", /cancelled/],
      ["unable_to_get_user_info", /details from Discord/],
    ])("explains %s", (code, message) => {
      renderWithMantine(<SignIn errorCode={code} />);
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Sign-in didn't finish");
      expect(alert).toHaveTextContent(message);
    });

    it("shows a generic message for an unknown code and never the raw value", () => {
      renderWithMantine(<SignIn errorCode="weird_thing" />);
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/Something went wrong/);
      expect(alert).not.toHaveTextContent("weird_thing");
    });

    it("shows nothing without a code", () => {
      renderWithMantine(<SignIn errorCode={null} />);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("dismisses and notifies the parent", async () => {
      const onDismissError = vi.fn();
      renderWithMantine(
        <SignIn errorCode="access_denied" onDismissError={onDismissError} />,
      );
      await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(onDismissError).toHaveBeenCalledTimes(1);
    });

    it("dismisses without a parent callback", async () => {
      renderWithMantine(<SignIn errorCode="access_denied" />);
      await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("clears the alert when a new sign-in starts, showing only the start failure", async () => {
      signInWithDiscord.mockRejectedValue(new Error("nope"));
      renderWithMantine(<SignIn errorCode="access_denied" />);
      await userEvent.click(
        screen.getByRole("button", { name: "Sign in with Discord" }),
      );
      const alerts = await screen.findAllByRole("alert");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toHaveTextContent(/Couldn.t start sign-in/);
    });
  });
});

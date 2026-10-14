import { act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MantineProvider } from "@mantine/core";

import Filters from "@/components/Filters";
import { PALETTE } from "@/lib/colors";
import { renderWithMantine } from "@/test/utils";

const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

const defaults = {
  players: [],
  playerOptions: ["alice", "bob"],
  onPlayersChange: () => {},
  hidePlayed: false,
  onHidePlayedChange: () => {},
  sortMode: "total" as const,
  onSortModeChange: () => {},
  shown: 3,
  total: 12,
  shareUrl: "https://games.example/2025?players=alice",
};

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
const originalSecure = Object.getOwnPropertyDescriptor(
  window,
  "isSecureContext",
);
const originalExec = (document as { execCommand?: unknown }).execCommand;

const stubExec = (value: () => boolean) =>
  Object.defineProperty(document, "execCommand", {
    value,
    configurable: true,
    writable: true,
  });

const stubClipboard = (writeText: () => Promise<void>) =>
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");

const stubShare = (value: unknown) =>
  Object.defineProperty(navigator, "share", { value, configurable: true });

describe("Filters", () => {
  afterEach(() => {
    if (originalShare) Object.defineProperty(navigator, "share", originalShare);
    else delete (navigator as { share?: unknown }).share;
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalClipboard)
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    else delete (navigator as { clipboard?: unknown }).clipboard;
    Object.defineProperty(document, "execCommand", {
      value: originalExec,
      configurable: true,
      writable: true,
    });
    if (originalSecure)
      Object.defineProperty(window, "isSecureContext", originalSecure);
    else delete (window as { isSecureContext?: unknown }).isSecureContext;
  });

  it("toggles hide-played through onHidePlayedChange", async () => {
    const user = userEvent.setup();
    const onHidePlayedChange = vi.fn();
    const { getByRole } = renderWithMantine(
      <Filters {...defaults} onHidePlayedChange={onHidePlayedChange} />,
    );

    await user.click(getByRole("checkbox"));

    expect(onHidePlayedChange).toHaveBeenCalledWith(true);
  });

  it("labels the toggle by selected players", () => {
    const { getByRole } = renderWithMantine(<Filters {...defaults} />);

    expect(
      getByRole("checkbox", { name: "Hide games played by selected players" }),
    ).toBeInTheDocument();
  });

  it("reflects the checked state", () => {
    const { getByRole } = renderWithMantine(
      <Filters {...defaults} hidePlayed={true} />,
    );

    expect(getByRole("checkbox")).toBeChecked();
  });

  it("renders a colored chip per player and forwards a pick", async () => {
    const user = userEvent.setup();
    const onPlayersChange = vi.fn();
    const { getByRole } = renderWithMantine(
      <Filters {...defaults} onPlayersChange={onPlayersChange} />,
    );

    const alice = getByRole("button", { name: "alice" });
    // playerOptions sort to alice(0), bob(1).
    expect(alice).toHaveStyle({ color: rgb(PALETTE[0]) });

    await user.click(alice);
    expect(onPlayersChange).toHaveBeenCalledWith(["alice"]);
  });

  it("offers the sort modes with the current one selected", () => {
    const { getByRole } = renderWithMantine(
      <Filters {...defaults} sortMode="even" />,
    );

    expect(
      getByRole("radiogroup", { name: "Sort games by" }),
    ).toBeInTheDocument();
    expect(getByRole("radio", { name: "Most even" })).toBeChecked();
    expect(getByRole("radio", { name: "Total" })).not.toBeChecked();
    expect(getByRole("radio", { name: "Lowest rank" })).toBeInTheDocument();
  });

  it("reports a picked sort mode", async () => {
    const user = userEvent.setup();
    const onSortModeChange = vi.fn();
    const { getByText } = renderWithMantine(
      <Filters {...defaults} onSortModeChange={onSortModeChange} />,
    );

    await user.click(getByText("Lowest rank"));

    expect(onSortModeChange).toHaveBeenCalledWith("lowest");
  });

  it("shows how many games are in view of the total", () => {
    const { getByText } = renderWithMantine(<Filters {...defaults} />);
    expect(getByText("3 of 12 games")).toBeInTheDocument();
  });

  it("copies the share link and confirms", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    const { getByRole } = renderWithMantine(<Filters {...defaults} />);

    await user.click(getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(defaults.shareUrl);
    expect(getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("skips the async clipboard in an insecure context", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "isSecureContext", {
      value: false,
      configurable: true,
    });
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    stubExec(() => false);
    const { getByRole, getByText } = renderWithMantine(
      <Filters {...defaults} />,
    );

    await user.click(getByRole("button", { name: "Copy link" }));

    expect(getByText("Copy failed")).toBeInTheDocument();
    expect(getByRole("textbox", { name: "Share link" })).toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("shows the link for manual copying when copying fails", async () => {
    const user = userEvent.setup();
    stubClipboard(() => Promise.reject(new Error("denied")));
    stubExec(() => false);
    const { getByRole, getByText } = renderWithMantine(
      <Filters {...defaults} />,
    );

    await user.click(getByRole("button", { name: "Copy link" }));

    expect(getByText("Copy failed")).toBeInTheDocument();
    const field = getByRole("textbox", { name: "Share link" });
    expect(field).toHaveValue(defaults.shareUrl);

    await user.click(field);
    expect((field as HTMLInputElement).selectionEnd).toBe(
      defaults.shareUrl.length,
    );
  });

  it("resets the label after a moment", async () => {
    vi.useFakeTimers();
    stubClipboard(() => Promise.resolve());
    const { getByRole } = renderWithMantine(<Filters {...defaults} />);

    await act(async () => {
      getByRole("button", { name: "Copy link" }).click();
    });
    expect(getByRole("button", { name: "Copied" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("ignores a copy that settles after unmount", async () => {
    vi.useFakeTimers();
    let resolve: () => void = () => {};
    stubClipboard(() => new Promise<void>((r) => (resolve = r)));
    const { getByRole, unmount } = renderWithMantine(<Filters {...defaults} />);

    await act(async () => {
      getByRole("button", { name: "Copy link" }).click();
    });
    unmount();
    await act(async () => {
      resolve();
    });

    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the failure when the share link changes", async () => {
    const user = userEvent.setup();
    stubClipboard(() => Promise.reject(new Error("denied")));
    stubExec(() => false);
    const { getByRole, queryByRole, queryByText, rerender } = renderWithMantine(
      <Filters {...defaults} />,
    );

    await user.click(getByRole("button", { name: "Copy link" }));
    expect(queryByText("Copy failed")).toBeInTheDocument();

    rerender(
      <MantineProvider>
        <Filters {...defaults} shareUrl="https://games.example/other" />
      </MantineProvider>,
    );

    expect(queryByText("Copy failed")).toBeNull();
    expect(queryByRole("textbox", { name: "Share link" })).toBeNull();
  });

  it("clears a failure after a later successful copy", async () => {
    const user = userEvent.setup();
    let ok = false;
    stubClipboard(() =>
      ok ? Promise.resolve() : Promise.reject(new Error("denied")),
    );
    stubExec(() => false);
    const { getByRole, queryByRole, queryByText } = renderWithMantine(
      <Filters {...defaults} />,
    );

    await user.click(getByRole("button", { name: "Copy link" }));
    expect(queryByText("Copy failed")).toBeInTheDocument();

    ok = true;
    await user.click(getByRole("button", { name: "Copy link" }));

    expect(queryByText("Copy failed")).toBeNull();
    expect(queryByRole("textbox", { name: "Share link" })).toBeNull();
    expect(getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  describe("Share button", () => {
    it("is absent without navigator.share", () => {
      const { queryByRole } = renderWithMantine(<Filters {...defaults} />);
      expect(queryByRole("button", { name: "Share" })).toBeNull();
    });

    it("is shown when navigator.share exists", () => {
      stubShare(vi.fn());
      const { getByRole } = renderWithMantine(<Filters {...defaults} />);
      expect(getByRole("button", { name: "Share" })).toBeInTheDocument();
    });

    it("shares the title and share url", async () => {
      const user = userEvent.setup();
      const share = vi.fn().mockResolvedValue(undefined);
      stubShare(share);
      const { getByRole } = renderWithMantine(<Filters {...defaults} />);

      await user.click(getByRole("button", { name: "Share" }));

      expect(share).toHaveBeenCalledWith({
        title: document.title,
        url: defaults.shareUrl,
      });
    });

    it("stays silent when the user cancels", async () => {
      const user = userEvent.setup();
      stubShare(vi.fn().mockRejectedValue(new DOMException("x", "AbortError")));
      const writeText = vi.spyOn(navigator.clipboard, "writeText");
      const { getByRole, queryByText } = renderWithMantine(
        <Filters {...defaults} />,
      );

      await user.click(getByRole("button", { name: "Share" }));

      await waitFor(() =>
        expect(getByRole("button", { name: "Share" })).toBeEnabled(),
      );
      expect(queryByText("Copy failed")).toBeNull();
      expect(writeText).not.toHaveBeenCalled();
    });

    it("stays silent on InvalidStateError", async () => {
      const user = userEvent.setup();
      stubShare(
        vi.fn().mockRejectedValue(new DOMException("x", "InvalidStateError")),
      );
      const writeText = vi.spyOn(navigator.clipboard, "writeText");
      const { getByRole, queryByText } = renderWithMantine(
        <Filters {...defaults} />,
      );

      await user.click(getByRole("button", { name: "Share" }));

      await waitFor(() =>
        expect(getByRole("button", { name: "Share" })).toBeEnabled(),
      );
      expect(queryByText("Copy failed")).toBeNull();
      expect(writeText).not.toHaveBeenCalled();
    });

    it("ignores a second tap while a share is pending", async () => {
      const user = userEvent.setup();
      let resolve: () => void = () => {};
      const share = vi.fn(() => new Promise<void>((r) => (resolve = r)));
      stubShare(share);
      const writeText = vi.spyOn(navigator.clipboard, "writeText");
      const { getByRole } = renderWithMantine(<Filters {...defaults} />);

      const button = getByRole("button", { name: "Share" });
      await user.click(button);
      await user.click(button);
      expect(share).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolve();
      });
      await waitFor(() => expect(button).toBeEnabled());
      expect(writeText).not.toHaveBeenCalled();
    });

    it("falls back to copying when sharing fails", async () => {
      const user = userEvent.setup();
      stubShare(vi.fn().mockRejectedValue(new Error("nope")));
      const writeText = vi.spyOn(navigator.clipboard, "writeText");
      const { getByRole, findByRole } = renderWithMantine(
        <Filters {...defaults} />,
      );

      await user.click(getByRole("button", { name: "Share" }));

      expect(
        await findByRole("button", { name: "Copied" }),
      ).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledWith(defaults.shareUrl);
    });

    it("shows the link when sharing and copying both fail", async () => {
      const user = userEvent.setup();
      stubShare(vi.fn().mockRejectedValue(new Error("nope")));
      stubClipboard(() => Promise.reject(new Error("denied")));
      stubExec(() => false);
      const { getByRole, findByText, findByRole } = renderWithMantine(
        <Filters {...defaults} />,
      );

      await user.click(getByRole("button", { name: "Share" }));

      expect(await findByText("Copy failed")).toBeInTheDocument();
      expect(await findByRole("textbox", { name: "Share link" })).toHaveValue(
        defaults.shareUrl,
      );
    });

    it("keeps Copy link working", async () => {
      const user = userEvent.setup();
      const share = vi.fn();
      stubShare(share);
      const writeText = vi.spyOn(navigator.clipboard, "writeText");
      const { getByRole } = renderWithMantine(<Filters {...defaults} />);

      await user.click(getByRole("button", { name: "Copy link" }));

      expect(writeText).toHaveBeenCalledWith(defaults.shareUrl);
      expect(share).not.toHaveBeenCalled();
      expect(getByRole("button", { name: "Copied" })).toBeInTheDocument();
    });
  });
});

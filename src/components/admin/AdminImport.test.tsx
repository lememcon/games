import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminImport from "@/components/admin/AdminImport";
import { renderWithMantine } from "@/test/utils";

const rows = [
  { bgg_id: 1, game: "A", player: "x", score: 5, rank: 1 },
  { bgg_id: 2, game: "B", player: "y", score: 3, rank: 1 },
];

const res = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const fileOf = (content: unknown, name = "scores.json") => {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const file = new File([text], name, { type: "application/json" });
  // jsdom's File has no text(); the page reads files through it.
  Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });
  return file;
};

const upload = async (content: unknown) => {
  const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
  await userEvent.upload(input, fileOf(content));
};

const fetchMock = vi.fn();

describe("AdminImport", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.clearAllMocks());

  it("starts idle with the button disabled", () => {
    renderWithMantine(<AdminImport />);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(screen.queryByText(/Preview/)).toBeNull();
  });

  it("previews a scores file and prefills its year", async () => {
    renderWithMantine(<AdminImport />);
    await upload({ year: 2027, player_game_scores: rows });

    expect(
      await screen.findByText("Preview: 2 score rows, 2 games, 2 players"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Year")).toHaveValue("2027");
    expect(screen.getByRole("button", { name: "Import 2027" })).toBeEnabled();
  });

  it("asks for a year when a scores file has none", async () => {
    renderWithMantine(<AdminImport />);
    await upload({ player_game_scores: rows });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a year for this scores file.",
    );
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Year"), "2027");
    expect(screen.getByRole("button", { name: "Import 2027" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("previews a games-only file", async () => {
    renderWithMantine(<AdminImport />);
    await upload({ 11: {}, 12: {} });

    expect(
      await screen.findByText("Preview: 2 games, no year"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
  });

  it("reports a file that is not JSON", async () => {
    renderWithMantine(<AdminImport />);
    await upload("{nope");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That file isn't valid JSON.",
    );
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("resets when the file is cleared", async () => {
    renderWithMantine(<AdminImport />);
    await upload({ year: 2027, player_game_scores: rows });
    await screen.findByText(/Preview/);

    await userEvent.click(screen.getByRole("button", { name: "Clear file" }));
    await waitFor(() => expect(screen.queryByText(/Preview/)).toBeNull());
  });

  it("posts a year upload and shows the success summary", async () => {
    fetchMock.mockResolvedValue(
      res(
        {
          year: 2027,
          scores: 2,
          games: { new: 1, updated: 1 },
          players: 2,
          warnings: ["renamed A to B"],
        },
        201,
      ),
    );
    renderWithMantine(<AdminImport />);
    await upload({ year: 2027, player_game_scores: rows });
    await userEvent.click(
      await screen.findByRole("button", { name: "Import 2027" }),
    );

    const status = await screen.findByRole("alert");
    expect(status).toHaveTextContent(
      "Imported 2027: 2 scores, 1 new games, 1 updated.",
    );
    expect(status).toHaveTextContent("renamed A to B");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/import");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      year: 2027,
      player_game_scores: rows,
    });
  });

  it("selects the imported year when viewing it", async () => {
    fetchMock.mockResolvedValue(
      res(
        {
          year: 2027,
          scores: 2,
          games: { new: 0, updated: 0 },
          players: 2,
          warnings: [],
        },
        201,
      ),
    );
    localStorage.setItem("players", JSON.stringify(["x"]));
    renderWithMantine(<AdminImport />);
    await upload({ year: 2027, player_game_scores: rows });
    await userEvent.click(
      await screen.findByRole("button", { name: "Import 2027" }),
    );
    await userEvent.click(
      await screen.findByRole("link", { name: "View 2027" }),
    );

    expect(JSON.parse(localStorage.getItem("year")!)).toBe("2027");
    expect(JSON.parse(localStorage.getItem("players")!)).toEqual([]);
    expect(window.location.pathname).toBe("/");
  });

  it("posts a games-only upload and reports no year", async () => {
    fetchMock.mockResolvedValue(
      res(
        {
          year: null,
          scores: 0,
          games: { new: 2, updated: 0 },
          players: 0,
          warnings: [],
        },
        201,
      ),
    );
    renderWithMantine(<AdminImport />);
    await upload({ games: { 11: {}, 12: {} } });
    await userEvent.click(
      await screen.findByRole("button", { name: "Import" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Imported games: 2 new, 0 updated.",
    );
    expect(screen.queryByRole("link", { name: /View/ })).toBeNull();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      games: { 11: {}, 12: {} },
    });
  });

  it("lists validation problems from a 422", async () => {
    const errors = Array.from({ length: 12 }, (_, i) => ({
      path: `player_game_scores[${i}].score`,
      message: "must be a number",
    }));
    errors.push({ path: "", message: "no path" });
    fetchMock.mockResolvedValue(res({ errors }, 422));
    renderWithMantine(<AdminImport />);
    await upload({ year: 2027, player_game_scores: rows });
    await userEvent.click(
      await screen.findByRole("button", { name: "Import 2027" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The file has problems:");
    expect(alert).toHaveTextContent(
      "player_game_scores[0].score: must be a number",
    );
    expect(alert).toHaveTextContent("and 3 more");
    expect(screen.queryByText("no path")).toBeNull();
  });

  it("shows a path-less problem as just its message", async () => {
    fetchMock.mockResolvedValue(
      res({ errors: [{ path: "", message: "no path" }] }, 422),
    );
    renderWithMantine(<AdminImport />);
    await upload({ year: 2027, player_game_scores: rows });
    await userEvent.click(
      await screen.findByRole("button", { name: "Import 2027" }),
    );

    expect(await screen.findByText("no path")).toBeInTheDocument();
  });

  it.each([
    [409, { error: "exists" }, "Year 2027 already exists."],
    [400, { error: "bad" }, "The server couldn't read that file as JSON."],
    [413, { error: "big" }, "That file is too large to import."],
    [401, { error: "no" }, "You no longer have admin access."],
    [403, { error: "no" }, "You no longer have admin access."],
    [500, { error: "boom" }, "Something went wrong. Try again."],
  ])("explains a %i response", async (status, body, message) => {
    fetchMock.mockResolvedValue(res(body, status));
    renderWithMantine(<AdminImport />);
    await upload({ year: 2027, player_game_scores: rows });
    await userEvent.click(
      await screen.findByRole("button", { name: "Import 2027" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("explains a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    renderWithMantine(<AdminImport />);
    await upload({ year: 2027, player_game_scores: rows });
    await userEvent.click(
      await screen.findByRole("button", { name: "Import 2027" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Try again.",
    );
  });

  it("clears the previous result when the year is edited", async () => {
    fetchMock.mockResolvedValue(res({ error: "exists" }, 409));
    renderWithMantine(<AdminImport />);
    await upload({ year: 2027, player_game_scores: rows });
    await userEvent.click(
      await screen.findByRole("button", { name: "Import 2027" }),
    );
    await screen.findByText("Year 2027 already exists.");

    await userEvent.type(screen.getByLabelText("Year"), "{Backspace}8");
    expect(screen.queryByText("Year 2027 already exists.")).toBeNull();
    expect(screen.getByRole("button", { name: "Import 2028" })).toBeEnabled();
  });
});

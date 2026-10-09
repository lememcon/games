import { describe, expect, it, vi } from "vitest";

import {
  BggError,
  abortableSleep,
  createBggClient,
  parseThings,
  sanitizeImage,
} from "./client";

const IMG = "https://cf.geekdo-images.com/abc__original/img/x/pic1.jpg";
const item = (id: number, extra = "") =>
  `<item type="boardgame" id="${id}"><image>${IMG}</image><minplayers value="2"/><maxplayers value="4"/>${extra}</item>`;
const xml = (...items: string[]) =>
  `<?xml version="1.0"?><items termsofuse="x">${items.join("")}</items>`;
const ok = (body: string) => new Response(body, { status: 200 });
const KEY = "sentinel-key-123456";

describe("sanitizeImage", () => {
  it("keeps https images on the BGG CDN", () => {
    expect(sanitizeImage(IMG)).toEqual({ imageUrl: IMG, ext: ".jpg" });
    expect(sanitizeImage(IMG.replace(".jpg", ".PNG")).ext).toBe(".png");
  });

  it("drops other hosts, schemes, junk and non-strings", () => {
    const none = { imageUrl: null, ext: null };
    expect(sanitizeImage("http://cf.geekdo-images.com/a.jpg")).toEqual(none);
    expect(sanitizeImage("https://evil.example/a.jpg")).toEqual(none);
    expect(sanitizeImage("https://cf.geekdo-images.com.evil.io/a.jpg")).toEqual(
      none,
    );
    expect(sanitizeImage("not a url")).toEqual(none);
    expect(sanitizeImage(undefined)).toEqual(none);
  });

  it("drops an extension that is not whitelisted but keeps the URL", () => {
    const url = "https://cf.geekdo-images.com/a/pic.svg";
    expect(sanitizeImage(url)).toEqual({ imageUrl: url, ext: null });
  });
});

describe("parseThings", () => {
  it("parses a single item (not an array)", () => {
    expect(parseThings(xml(item(5)))).toEqual([
      { bggId: 5, minPlayers: 2, maxPlayers: 4, imageUrl: IMG, ext: ".jpg" },
    ]);
  });

  it("parses several items", () => {
    expect(parseThings(xml(item(5), item(6))).map((g) => g.bggId)).toEqual([
      5, 6,
    ]);
  });

  it("tolerates missing image and players", () => {
    expect(parseThings(xml('<item type="boardgame" id="7"></item>'))).toEqual([
      {
        bggId: 7,
        minPlayers: null,
        maxPlayers: null,
        imageUrl: null,
        ext: null,
      },
    ]);
  });

  it("rejects out-of-range player counts and invalid ids", () => {
    const bad = `<item id="8"><minplayers value="-1"/><maxplayers value="abc"/></item>`;
    const games = parseThings(
      xml(bad, '<item id="x"></item>', "<item></item>"),
    );
    expect(games).toEqual([
      {
        bggId: 8,
        minPlayers: null,
        maxPlayers: null,
        imageUrl: null,
        ext: null,
      },
    ]);
  });

  it("returns no games for an empty items element", () => {
    expect(parseThings('<items total="0"></items>')).toEqual([]);
  });

  it("throws on an error root element or non-xml", () => {
    expect(() =>
      parseThings("<errors><error><message>x</message></error></errors>"),
    ).toThrow(BggError);
    expect(() => parseThings("")).toThrow(BggError);
  });

  it("throws a parse error when the parser itself fails", () => {
    expect(() => parseThings('<items a="1></items>')).toThrow(BggError);
  });
});

describe("fetchThings", () => {
  it("sends the key as a bearer token and lists ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(xml(item(1), item(2))));
    const client = createBggClient({ fetch: fetchMock, sleep: vi.fn() });
    const batch = await client.fetchThings([1, 2], KEY);
    expect(batch.notFound).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("id=1,2");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it("reports ids BGG did not return when some items parsed", async () => {
    const client = createBggClient({
      fetch: vi.fn().mockResolvedValue(ok(xml(item(1)))),
    });
    expect((await client.fetchThings([1, 2], KEY)).notFound).toEqual([2]);
  });

  it("reports every id as not found for an empty items root", async () => {
    const client = createBggClient({
      fetch: vi.fn().mockResolvedValue(ok("<items></items>")),
    });
    await expect(client.fetchThings([1, 2], KEY)).resolves.toEqual({
      games: [],
      notFound: [1, 2],
    });
  });

  it("treats a missing items root as a parse error", async () => {
    const client = createBggClient({
      fetch: vi.fn().mockResolvedValue(ok("<errors></errors>")),
    });
    await expect(client.fetchThings([1], KEY)).rejects.toMatchObject({
      kind: "parse",
    });
  });

  it.each([401, 403])(
    "maps %i to an auth error without retrying",
    async (s) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("secret body", { status: s }));
      const client = createBggClient({ fetch: fetchMock, sleep: vi.fn() });
      await expect(client.fetchThings([1], KEY)).rejects.toMatchObject({
        kind: "auth",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("maps other failures to a fixed upstream error", async () => {
    const client = createBggClient({
      fetch: vi
        .fn()
        .mockResolvedValue(new Response("leaky body", { status: 500 })),
    });
    const err = await client.fetchThings([1], KEY).catch((e: Error) => e);
    expect(err).toMatchObject({ kind: "upstream" });
    expect((err as Error).message).not.toContain("leaky");
  });

  it("maps a throwing fetch to an upstream error", async () => {
    const client = createBggClient({
      fetch: vi.fn().mockRejectedValue(new Error(`boom ${KEY}`)),
    });
    const err = await client.fetchThings([1], KEY).catch((e: Error) => e);
    expect(err).toMatchObject({ kind: "upstream" });
    expect((err as Error).message).not.toContain(KEY);
  });

  it("retries 429 with backoff, honouring Retry-After, then succeeds", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "7" } }),
      )
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(ok(xml(item(1))));
    const client = createBggClient({ fetch: fetchMock, sleep });
    await client.fetchThings([1], KEY);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([7000, 4000]);
  });

  it("caps an excessive Retry-After", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "9999" } }),
      )
      .mockResolvedValueOnce(ok(xml(item(1))));
    await createBggClient({ fetch: fetchMock, sleep }).fetchThings([1], KEY);
    expect(sleep).toHaveBeenCalledWith(60_000, undefined);
  });

  it("gives up with rate_limit after 3 retries", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response("", { status: 429 }));
    const client = createBggClient({
      fetch: fetchMock,
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    await expect(client.fetchThings([1], KEY)).rejects.toMatchObject({
      kind: "rate_limit",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("retries a 202 and reports upstream if it never completes", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 202 }))
      .mockResolvedValueOnce(ok(xml(item(1))));
    expect(
      (await createBggClient({ fetch: fetchMock, sleep }).fetchThings([1], KEY))
        .games,
    ).toHaveLength(1);

    const stuck = vi
      .fn()
      .mockImplementation(async () => new Response("", { status: 202 }));
    await expect(
      createBggClient({ fetch: stuck, sleep }).fetchThings([1], KEY),
    ).rejects.toMatchObject({ kind: "upstream" });
  });

  it("times out a fetch that never resolves", async () => {
    const client = createBggClient({
      fetch: vi.fn().mockReturnValue(new Promise(() => {})),
      timeoutMs: 20,
    });
    await expect(client.fetchThings([1], KEY)).rejects.toMatchObject({
      kind: "timeout",
    });
  });

  it("reports cancelled when the caller aborts, including during a retry sleep", async () => {
    const controller = new AbortController();
    const client = createBggClient({
      fetch: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    const pending = client.fetchThings([1], KEY, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: "cancelled" });

    const again = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 429 }));
    const sleeping = createBggClient({
      fetch: fetchMock,
      sleep: async () => again.abort(),
    });
    await expect(
      sleeping.fetchThings([1], KEY, again.signal),
    ).rejects.toMatchObject({
      kind: "cancelled",
    });
  });

  it("is already cancelled when given an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = createBggClient({
      fetch: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    await expect(
      client.fetchThings([1], KEY, controller.signal),
    ).rejects.toMatchObject({
      kind: "cancelled",
    });
  });
});

describe("testKey", () => {
  const check = (res: Response) =>
    createBggClient({ fetch: vi.fn().mockResolvedValue(res) }).testKey(KEY);

  it("classifies responses", async () => {
    expect(await check(ok("<items/>"))).toBe("valid");
    expect(await check(new Response("", { status: 202 }))).toBe("valid");
    expect(await check(new Response("", { status: 401 }))).toBe("invalid");
    expect(await check(new Response("", { status: 403 }))).toBe("invalid");
    expect(await check(new Response("", { status: 429 }))).toBe("rate_limited");
    await expect(
      check(new Response("", { status: 500 })),
    ).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("makes exactly one request for a single id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok("<items/>"));
    await createBggClient({ fetch: fetchMock }).testKey(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/id=13$/);
  });
});

describe("abortableSleep", () => {
  it("resolves after the delay", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    void abortableSleep(1000).then(done);
    await vi.advanceTimersByTimeAsync(999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("resolves early on abort, and immediately if already aborted", async () => {
    const controller = new AbortController();
    const sleeping = abortableSleep(60_000, controller.signal);
    controller.abort();
    await sleeping;
    await abortableSleep(60_000, controller.signal);
  });
});

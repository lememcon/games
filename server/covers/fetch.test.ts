import { describe, expect, it, vi } from "vitest";

import { IMAGE_HOST } from "../bgg/client";
import { CoverFetchError, createCoverFetcher } from "./fetch";

const URL_OK = `https://${IMAGE_HOST}/pic/cover.jpg?secret=1`;

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const WEBP = [0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9, 0x57, 0x45, 0x42, 0x50, 0x56];

const respond =
  (body: ConstructorParameters<typeof Response>[0], init?: ResponseInit) =>
  async () =>
    new Response(body, init);

const kindOf = async (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: unknown) => (e instanceof CoverFetchError ? e.kind : e),
  );

const make = (f: typeof fetch, extra = {}) =>
  createCoverFetcher({ fetch: f, ...extra });

describe("createCoverFetcher", () => {
  it.each([
    ["jpeg", JPEG, "image/jpeg", "jpg"],
    ["png", PNG, "image/png", "png"],
    ["gif", GIF, "image/gif", "gif"],
    ["webp", WEBP, "image/webp", "webp"],
  ])("sniffs %s", async (_n, bytes, contentType, ext) => {
    const f = make(
      respond(new Uint8Array(bytes), {
        headers: { "content-type": "text/plain" },
      }),
    );
    const out = await f.call(null, URL_OK);
    expect(out.contentType).toBe(contentType);
    expect(out.ext).toBe(ext);
    expect(Array.from(out.bytes)).toEqual(bytes);
  });

  it("sends a credential-free, no-redirect request", async () => {
    const fetchMock = vi.fn(respond(new Uint8Array(JPEG)));
    await make(fetchMock as unknown as typeof fetch)(URL_OK);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(URL_OK);
    expect(init.redirect).toBe("error");
    expect(init.credentials).toBe("omit");
    expect(Object.keys(init.headers as object)).toEqual(["Accept"]);
  });

  it("uses the global fetch by default", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = respond(new Uint8Array(PNG)) as typeof fetch;
    try {
      const out = await createCoverFetcher()(URL_OK);
      expect(out.ext).toBe("png");
    } finally {
      globalThis.fetch = original;
    }
  });

  it.each([
    ["wrong host", "https://example.com/a.jpg"],
    ["http", `http://${IMAGE_HOST}/a.jpg`],
    ["lookalike", `https://${IMAGE_HOST}.evil.com/a.jpg`],
    ["userinfo", `https://user:pw@${IMAGE_HOST}/a.jpg`],
    ["port", `https://${IMAGE_HOST}:8443/a.jpg`],
    ["garbage", "not a url"],
  ])("rejects %s before fetching", async (_n, url) => {
    const fetchMock = vi.fn();
    expect(await kindOf(make(fetchMock)(url))).toBe("host");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a response url on another host", async () => {
    const f = make((async () => {
      const res = new Response(new Uint8Array(JPEG));
      Object.defineProperty(res, "url", { value: "https://evil.com/x.jpg" });
      return res;
    }) as unknown as typeof fetch);
    expect(await kindOf(f(URL_OK))).toBe("host");
  });

  it("rejects an unparseable response url", async () => {
    const f = make((async () => {
      const res = new Response(new Uint8Array(JPEG));
      Object.defineProperty(res, "url", { value: "::bad" });
      return res;
    }) as unknown as typeof fetch);
    expect(await kindOf(f(URL_OK))).toBe("host");
  });

  it("accepts a response url on the image host", async () => {
    const f = make((async () => {
      const res = new Response(new Uint8Array(JPEG));
      Object.defineProperty(res, "url", { value: URL_OK });
      return res;
    }) as unknown as typeof fetch);
    expect(await kindOf(f(URL_OK))).toBe("ok");
  });

  it("maps a redirect error to upstream", async () => {
    const f = make((async () => {
      throw new TypeError("unexpected redirect");
    }) as unknown as typeof fetch);
    expect(await kindOf(f(URL_OK))).toBe("upstream");
  });

  it("rejects non-2xx", async () => {
    const f = make(respond("nope", { status: 404 }));
    expect(await kindOf(f(URL_OK))).toBe("upstream");
  });

  it("rejects a missing body", async () => {
    const f = make(respond(null, { status: 200 }));
    expect(await kindOf(f(URL_OK))).toBe("upstream");
  });

  it("rejects an oversized Content-Length", async () => {
    const f = make(
      respond(new Uint8Array(JPEG), { headers: { "content-length": "100" } }),
      { maxBytes: 10 },
    );
    expect(await kindOf(f(URL_OK))).toBe("too_large");
  });

  it("cancels the stream at the cap when the header lies", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(8));
      },
      cancel,
    });
    const f = make(respond(body, { headers: { "content-length": "4" } }), {
      maxBytes: 20,
    });
    expect(await kindOf(f(URL_OK))).toBe("too_large");
    expect(cancel).toHaveBeenCalled();
  });

  it.each([
    ["svg", "<svg xmlns='http://www.w3.org/2000/svg'/>"],
    ["html", "<html><script>1</script></html>"],
    ["short", "RIFF"],
  ])("rejects %s labelled image/png", async (_n, text) => {
    const f = make(respond(text, { headers: { "content-type": "image/png" } }));
    expect(await kindOf(f(URL_OK))).toBe("type");
  });

  it("times out on slow headers", async () => {
    const f = make(
      ((_u: string, init: RequestInit) =>
        new Promise((_res, rej) =>
          init.signal?.addEventListener("abort", () => rej(new Error("x"))),
        )) as unknown as typeof fetch,
      { headerTimeoutMs: 10, timeoutMs: 1000 },
    );
    expect(await kindOf(f(URL_OK))).toBe("timeout");
  });

  it("times out on a stalled body", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull: () => new Promise(() => {}),
    });
    const f = make(respond(body), { timeoutMs: 20, headerTimeoutMs: 1000 });
    expect(await kindOf(f(URL_OK))).toBe("timeout");
  });

  it("propagates a caller abort", async () => {
    const ctl = new AbortController();
    const f = make(
      ((_u: string, init: RequestInit) =>
        new Promise((_res, rej) =>
          init.signal?.addEventListener("abort", () => rej(new Error("x"))),
        )) as unknown as typeof fetch,
    );
    const p = f(URL_OK, ctl.signal);
    ctl.abort(new Error("stop"));
    await expect(p).rejects.toThrow("stop");
  });

  it("propagates a caller abort mid-body", async () => {
    const ctl = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      pull: () => new Promise(() => {}),
    });
    const p = make(respond(body))(URL_OK, ctl.signal);
    setTimeout(() => ctl.abort(new Error("stop")), 5);
    await expect(p).rejects.toThrow("stop");
  });

  it("never echoes the url or body in error messages", async () => {
    const err = await make(respond("SECRETBODY", { status: 500 }))(
      URL_OK,
    ).catch((e: Error) => e);
    expect((err as Error).message).not.toMatch(/secret|SECRETBODY/i);
  });
});

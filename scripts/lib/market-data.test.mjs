import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPolygonBars, isPlaceholderRow, isRegularSession, pickSource } from "./market-data.mjs";

// Not a real key. The suite never sends anything to Polygon; fetch is stubbed.
const FAKE_KEY = "test-key-not-real";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-03-02T14:30:00Z");

const page = (times, nextUrl) => ({
  ok: true,
  status: 200,
  json: async () => ({ results: times.map((t) => ({ t, o: 1, h: 1, l: 1, c: 1, v: 1 })), next_url: nextUrl }),
});

afterEach(() => vi.unstubAllGlobals());

describe("isRegularSession", () => {
  it("opens at 9:30 New York and closes before 16:00, in winter", () => {
    expect(isRegularSession(new Date("2026-01-15T14:30:00Z"))).toBe(true);
    expect(isRegularSession(new Date("2026-01-15T14:29:00Z"))).toBe(false);
    expect(isRegularSession(new Date("2026-01-15T20:59:00Z"))).toBe(true);
    expect(isRegularSession(new Date("2026-01-15T21:00:00Z"))).toBe(false);
  });

  it("follows daylight saving time", () => {
    expect(isRegularSession(new Date("2026-07-15T13:30:00Z"))).toBe(true);
    expect(isRegularSession(new Date("2026-07-15T13:29:00Z"))).toBe(false);
    expect(isRegularSession(new Date("2026-07-15T20:00:00Z"))).toBe(false);
  });
});

describe("isPlaceholderRow", () => {
  it("flags zero-volume bars outside the session", () => {
    expect(isPlaceholderRow("2026-03-12T21:00:00.000Z,666.96,667.02,630.117,666.9381,0")).toBe(true);
    expect(isPlaceholderRow("2026-09-18T23:59:59.000Z,762.94,762.94,762.94,762.94,0")).toBe(true);
  });

  it("keeps real bars, and thin in-session bars with no volume", () => {
    expect(isPlaceholderRow("2026-03-12T14:30:00.000Z,666.96,667.02,666.1,666.9,7871872")).toBe(false);
    expect(isPlaceholderRow("2026-03-12T15:00:00.000Z,666.96,666.96,666.96,666.96,0")).toBe(false);
  });

  it("keeps an off-session bar that did trade", () => {
    expect(isPlaceholderRow("2026-03-12T21:00:00.000Z,666.96,667.02,666.1,666.9,1200")).toBe(false);
  });
});

describe("pickSource", () => {
  it("sends sub-hour stock intervals to Polygon", () => {
    expect(pickSource("AAPL", "5m", FAKE_KEY).source).toBe("polygon");
    expect(pickSource("BRK.B", "1m", FAKE_KEY).source).toBe("polygon");
  });

  it("leaves hourly and longer on Yahoo, which already serves a year or more", () => {
    expect(pickSource("AAPL", "1h", FAKE_KEY)).toEqual({ source: "yahoo" });
    expect(pickSource("AAPL", "1d", FAKE_KEY)).toEqual({ source: "yahoo" });
  });

  it("falls back to Yahoo, and says why, without a key or for futures", () => {
    expect(pickSource("AAPL", "5m", "").note).toMatch(/POLYGON_API_KEY/);
    expect(pickSource("ES=F", "5m", FAKE_KEY).note).toMatch(/ES=F/);
  });
});

describe("fetchPolygonBars", () => {
  it("keeps paging on next_url even when a page is far shorter than the limit", async () => {
    // Polygon's limit counts base 1-minute bars, so a 30m request truncates
    // after ~1,800 bars with a next_url. A short page is not the end.
    const next = "https://api.polygon.io/v2/aggs/ticker/SPY/range/30/minute/x/y?cursor=abc";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page([T0, T0 + 1800000], next))
      .mockResolvedValueOnce(page([T0 + 3600000]));
    vi.stubGlobal("fetch", fetchMock);

    const { bars, requests } = await fetchPolygonBars("SPY", "30m", "2026-03-02", "2026-03-02", { apiKey: FAKE_KEY });

    expect(bars).toHaveLength(3);
    expect(requests).toBe(2);
    expect(fetchMock.mock.calls[1][0]).toBe(next);
  });

  it("resumes after the last bar when a page fills the limit without a next_url, and never double-counts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page([T0, T0 + 60000]))
      .mockResolvedValueOnce(page([T0 + 60000, T0 + 120000])) // repeated bar at the boundary
      .mockResolvedValueOnce(page([T0 + 180000]));
    vi.stubGlobal("fetch", fetchMock);

    const { bars, requests } = await fetchPolygonBars("AAPL", "1m", "2026-03-02", "2026-03-02", { apiKey: FAKE_KEY, pageLimit: 2 });

    expect(bars.map((b) => b.t)).toEqual([T0, T0 + 60000, T0 + 120000, T0 + 180000]);
    expect(requests).toBe(3);
    expect(fetchMock.mock.calls[1][0]).toContain(`/range/1/minute/${T0 + 120000}/2026-03-02`);
  });

  it("asks for date boundaries, not millisecond ones, so multi-minute bars stay on the grid", async () => {
    const fetchMock = vi.fn().mockResolvedValue(page([T0]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchPolygonBars("SPY", "30m", "2026-03-02", "2026-03-02", { apiKey: FAKE_KEY });

    expect(fetchMock.mock.calls[0][0]).toContain("/range/30/minute/2026-03-02/2026-03-02");
  });

  it("sends the key as a header, never in a URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(page([T0]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchPolygonBars("SPY", "5m", "2026-03-02", "2026-03-02", { apiKey: FAKE_KEY });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain(FAKE_KEY);
    expect(init.headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
  });

  it("refuses a series that stops well short of the end date instead of returning part of a year", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page([T0 - 60 * DAY])));

    await expect(fetchPolygonBars("SPY", "30m", "2026-01-01", "2026-03-02", { apiKey: FAKE_KEY })).rejects.toThrow(/only up to/);
  });

  it("waits and retries when rate limited", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers() })
      .mockResolvedValueOnce(page([T0]));
    vi.stubGlobal("fetch", fetchMock);

    const { bars } = await fetchPolygonBars("AAPL", "1m", "2026-03-02", "2026-03-02", { apiKey: FAKE_KEY, baseWaitMs: 1 });

    expect(bars).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a rejected key without echoing it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: "Unknown API Key" }) }));

    const error = await fetchPolygonBars("AAPL", "1m", "2026-03-02", "2026-03-02", { apiKey: FAKE_KEY }).catch((e) => e);

    expect(error.message).toMatch(/HTTP 401.*Unknown API Key/);
    expect(error.message).not.toContain(FAKE_KEY);
  });
});

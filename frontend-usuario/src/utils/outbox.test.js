import { beforeEach, describe, expect, it, vi } from "vitest";
import { OUTBOX_KEY, clearUser, flush, isRetryable, pendingCount, submit } from "./outbox.js";

const err = (status) => Object.assign(new Error("x"), { status });

describe("outbox", () => {
  beforeEach(() => localStorage.removeItem(OUTBOX_KEY));

  it("isRetryable: red, 429 y 5xx sí; 4xx y errores sin status no", () => {
    expect([0, 429, 500, 503].every((s) => isRetryable(err(s)))).toBe(true);
    expect([401, 404, 422].some((s) => isRetryable(err(s)))).toBe(false);
    expect(isRetryable(new Error("boom"))).toBe(false);
  });

  it("envía directo cuando hay red y no encola", async () => {
    const run = vi.fn(async () => "ok");
    expect(await submit(1, "checkin", {}, run)).toEqual({ queued: false, data: "ok" });
    expect(pendingCount(1)).toBe(0);
  });

  it("sin red encola; un 4xx se relanza sin encolar", async () => {
    expect(await submit(1, "checkin", {}, async () => { throw err(0); })).toEqual({ queued: true });
    expect(pendingCount(1)).toBe(1);
    await expect(submit(2, "checkin", {}, async () => { throw err(422); })).rejects.toMatchObject({ status: 422 });
    expect(pendingCount(2)).toBe(0);
  });

  it("con pendientes, lo nuevo se encola detrás (orden) y flush los manda FIFO", async () => {
    await submit(1, "checkin", {}, async () => { throw err(0); });
    const direct = vi.fn();
    expect(await submit(1, "checkout", {}, direct)).toEqual({ queued: true });
    expect(direct).not.toHaveBeenCalled();

    const order = [];
    expect(await flush(1, async (j) => { order.push(j.kind); })).toBe(2);
    expect(order).toEqual(["checkin", "checkout"]);
    expect(pendingCount(1)).toBe(0);
  });

  it("flush se detiene ante un fallo reintentable o 401 y conserva el trabajo", async () => {
    await submit(1, "a", {}, async () => { throw err(0); });
    await submit(1, "b", {}, async () => {});
    expect(await flush(1, async () => { throw err(500); })).toBe(0);
    expect(await flush(1, async () => { throw err(401); })).toBe(0);
    expect(pendingCount(1)).toBe(2);
  });

  it("flush descarta un 4xx definitivo y sigue con el siguiente", async () => {
    await submit(1, "a", {}, async () => { throw err(0); });
    await submit(1, "b", {}, async () => {});
    const seen = [];
    const n = await flush(1, async (j) => { seen.push(j.kind); if (j.kind === "a") throw err(422); });
    expect(n).toBe(2);
    expect(seen).toEqual(["a", "b"]);
  });

  it("nunca envía trabajos de otro usuario", async () => {
    await submit(1, "a", {}, async () => { throw err(0); });
    const run = vi.fn();
    expect(await flush(2, run)).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(pendingCount(1)).toBe(1);
  });
});

describe("clearUser", () => {
  it("borra solo los trabajos del usuario indicado", async () => {
    const fail = () => Promise.reject({ status: 0 });
    await submit("a", "checkin", {}, fail);
    await submit("b", "checkin", {}, fail);
    clearUser("a");
    expect(pendingCount("a")).toBe(0);
    expect(pendingCount("b")).toBe(1);
    clearUser("b");
  });
});

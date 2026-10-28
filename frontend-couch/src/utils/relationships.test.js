import { describe, expect, it } from "vitest";
import { groupRelationships } from "./relationships.js";

const rows = [
  { id: 1, status: "active", viewer_role: "coach", athlete: { name: "A" } },
  { id: 2, status: "pending", viewer_role: "coach", athlete: { name: "B" } },
  { id: 3, status: "pending", viewer_role: "athlete", coach: { name: "C" } },
  { id: 4, status: "active", viewer_role: "athlete", coach: { name: "D" } },
  { id: 5, status: "revoked", viewer_role: "coach", athlete: { name: "E" } },
];

describe("groupRelationships", () => {
  it("agrupa por viewer_role y status, ignorando las revocadas", () => {
    const g = groupRelationships(rows);
    expect(g.activeAthletes.map((r) => r.id)).toEqual([1]);
    expect(g.pendingSent.map((r) => r.id)).toEqual([2]);
    expect(g.pendingReceived.map((r) => r.id)).toEqual([3]);
    expect(g.activeCoaches.map((r) => r.id)).toEqual([4]);
  });

  it("tolera una entrada vacía", () => {
    expect(groupRelationships().activeAthletes).toEqual([]);
  });
});

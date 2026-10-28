import { describe, expect, it } from "vitest";
import { groupRelationships } from "./relationships.js";

const rel = (over) => ({
  id: 1,
  status: "pending",
  viewer_role: "athlete",
  coach: { id: 10, name: "Coach" },
  athlete: { id: 20, name: "Yo" },
  ...over,
});

describe("groupRelationships", () => {
  it("clasifica por viewer_role + status e ignora las revocadas", () => {
    const out = groupRelationships([
      rel({ id: 1, viewer_role: "athlete", status: "pending" }),
      rel({ id: 2, viewer_role: "athlete", status: "active" }),
      rel({ id: 3, viewer_role: "athlete", status: "revoked" }),
      rel({ id: 4, viewer_role: "coach", status: "pending" }),
      rel({ id: 5, viewer_role: "coach", status: "active" }),
    ]);

    expect(out.pendingReceived.map((r) => r.id)).toEqual([1]);
    expect(out.activeCoaches.map((r) => r.id)).toEqual([2]);
    expect(out.pendingSent.map((r) => r.id)).toEqual([4]);
    expect(out.activeAthletes.map((r) => r.id)).toEqual([5]);
  });

  it("un atleta puede tener varios coaches activos y varias solicitudes", () => {
    const out = groupRelationships([
      rel({ id: 1, status: "active" }),
      rel({ id: 2, status: "active" }),
      rel({ id: 3, status: "pending" }),
    ]);
    expect(out.activeCoaches).toHaveLength(2);
    expect(out.pendingReceived).toHaveLength(1);
  });

  it("entrada vacía o ausente → todas las listas vacías", () => {
    for (const input of [undefined, []]) {
      const out = groupRelationships(input);
      expect(out.pendingReceived).toEqual([]);
      expect(out.activeCoaches).toEqual([]);
      expect(out.pendingSent).toEqual([]);
      expect(out.activeAthletes).toEqual([]);
    }
  });
});

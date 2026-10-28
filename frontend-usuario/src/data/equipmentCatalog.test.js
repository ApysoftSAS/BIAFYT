/**
 * data/equipmentCatalog.js — el catálogo de máquinas se hidrata del backend
 * (`GET /equipment`) y solo cae a `data/machines.js` si la API falla o
 * devuelve un shape inválido. Nunca mezcla datos.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { machines as localMachines } from "./machines.js";
import { normalizeApiEquipment, loadEquipmentCatalog } from "./equipmentCatalog.js";
import * as api from "../utils/api.js";

afterEach(() => vi.restoreAllMocks());

describe("normalizeApiEquipment", () => {
  it("mapea el shape del backend al shape local (id = slug, primary = primary_muscle, arrays)", () => {
    const row = {
      id: 3,
      slug: "m-prensa",
      name: "PRENSA DE PIERNAS",
      purpose: "Empuje de tren inferior.",
      primary_muscle: "Cuádriceps",
      secondary_muscles: ["Glúteo mayor", "Isquiotibiales"],
      movement: "Empuje de tren inferior",
      level: "Principiante",
      tips: ["a", "b"],
      mistakes: ["x"],
      related: ["Sentadilla"],
      art: "legPress",
    };
    expect(normalizeApiEquipment(row)).toEqual({
      id: "m-prensa",
      name: "PRENSA DE PIERNAS",
      purpose: "Empuje de tren inferior.",
      primary: "Cuádriceps",
      secondary: ["Glúteo mayor", "Isquiotibiales"],
      movement: "Empuje de tren inferior",
      level: "Principiante",
      tips: ["a", "b"],
      mistakes: ["x"],
      related: ["Sentadilla"],
      art: "legPress",
    });
  });

  it("rellena huecos con defaults seguros y arte por defecto", () => {
    const n = normalizeApiEquipment({ slug: "m-x", name: "X" });
    expect(n).toEqual({
      id: "m-x",
      name: "X",
      purpose: "",
      primary: "",
      secondary: [],
      movement: "",
      level: "",
      tips: [],
      mistakes: [],
      related: [],
      art: "chestPress",
    });
  });

  it("rechaza filas sin slug/name", () => {
    expect(normalizeApiEquipment({ name: "X" })).toBeNull();
    expect(normalizeApiEquipment({ slug: "m-x" })).toBeNull();
    expect(normalizeApiEquipment(null)).toBeNull();
  });
});

describe("loadEquipmentCatalog", () => {
  it("usa el catálogo remoto si la API responde bien", async () => {
    vi.spyOn(api, "apiGetEquipment").mockResolvedValue({
      equipment: [
        { slug: "m-solo-backend", name: "SOLO BACKEND", primary_muscle: "Test", art: "legPress" },
      ],
    });
    const catalog = await loadEquipmentCatalog();
    expect(catalog).toHaveLength(1);
    expect(catalog[0].id).toBe("m-solo-backend");
    expect(catalog[0].name).toBe("SOLO BACKEND");
  });

  it("cae al local si la API lanza", async () => {
    vi.spyOn(api, "apiGetEquipment").mockRejectedValue(new Error("network"));
    const catalog = await loadEquipmentCatalog();
    expect(catalog).toBe(localMachines);
  });

  it("cae al local si la API devuelve una lista vacía o un shape inválido", async () => {
    vi.spyOn(api, "apiGetEquipment").mockResolvedValue({ equipment: [] });
    expect(await loadEquipmentCatalog()).toBe(localMachines);

    vi.spyOn(api, "apiGetEquipment").mockResolvedValue({ equipment: [{ name: "sin slug" }] });
    expect(await loadEquipmentCatalog()).toBe(localMachines);
  });
});

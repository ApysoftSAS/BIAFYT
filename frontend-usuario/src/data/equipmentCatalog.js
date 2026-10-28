/**
 * BIAFYT — CATÁLOGO DE MÁQUINAS (frontera de integración backend)
 * ---------------------------------------------------------------
 * La fuente de verdad del catálogo de máquinas es el backend: la tabla
 * `equipment` (`GET /api/v1/equipment`, público, solo items activos).
 *
 * `data/machines.js` queda SOLO como fallback offline: si la API no
 * responde o devuelve un formato inesperado, se usa el local tal cual. No
 * se mezclan datos: o todo remoto o todo local.
 *
 * Ambos orígenes se normalizan al MISMO shape que ya consumen
 * `screens/Machines.jsx` y `utils/analytics.js` — el `id` string estable es
 * el `slug` del backend (`m-prensa`, …), que es también el espacio de ids
 * que usan `exercises.js#machineId` y `components/MachineArt.jsx` (`art`).
 */

import { machines as localMachines } from "./machines.js";
import { apiGetEquipment } from "../utils/api.js";

/** @returns {null | object} fila normalizada, o null si la fila remota es inválida. */
export function normalizeApiEquipment(row) {
  if (!row || typeof row !== "object") return null;
  if (typeof row.slug !== "string" || !row.slug) return null;
  if (typeof row.name !== "string" || !row.name) return null;
  return {
    id: row.slug,
    name: row.name,
    purpose: row.purpose ?? "",
    primary: row.primary_muscle ?? "",
    secondary: Array.isArray(row.secondary_muscles) ? row.secondary_muscles : [],
    movement: row.movement ?? "",
    level: row.level ?? "",
    tips: Array.isArray(row.tips) ? row.tips : [],
    mistakes: Array.isArray(row.mistakes) ? row.mistakes : [],
    related: Array.isArray(row.related) ? row.related : [],
    // `art` decide qué ilustración de MachineArt.jsx se usa; si el item
    // nuevo no trae una conocida, MachineArt cae a un dibujo por defecto.
    art: typeof row.art === "string" && row.art ? row.art : "chestPress",
  };
}

/**
 * Intenta hidratar el catálogo desde el backend. Si algo falla (red,
 * shape inesperado, lista vacía), devuelve `machines.js` local sin lanzar.
 *
 * @returns {Promise<Array<object>>}
 */
export async function loadEquipmentCatalog() {
  try {
    const data = await apiGetEquipment();
    const rows = Array.isArray(data?.equipment) ? data.equipment : null;
    if (!rows || rows.length === 0) return localMachines;

    const normalized = rows.map(normalizeApiEquipment);
    if (normalized.some((r) => r === null)) return localMachines;

    return normalized;
  } catch {
    return localMachines;
  }
}

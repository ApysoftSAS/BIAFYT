/**
 * TEST DE FORMA ESTÁTICA — atrapa un campo nuevo añadido a `defaultState`
 * (o a `DEFAULT_IDENTITY_STATE`/`DEFAULT_DEVICE_STATE`/`DEFAULT_AUTH_STATE`)
 * sin que alguien haya decidido su scope explícitamente en stateSchema.js.
 *
 * A propósito, `stateSchema.js` NO se deriva de `defaultState` (ver ese
 * archivo): si lo hiciera, este test pasaría siempre, sin importar qué se
 * añada, que es exactamente el bug que debe atrapar.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_DEVICE_STATE, DEFAULT_AUTH_STATE, DEFAULT_IDENTITY_STATE, defaultState } from "./AppContext.jsx";
import {
  STATE_KEYS,
  DEVICE_KEYS,
  DEVICE_SETTINGS_KEYS,
  DEVICE_COACH_KEYS,
  AUTH_KEYS,
  AUTH_BIOMETRIC_KEYS,
  IDENTITY_KEYS,
  IDENTITY_USER_KEYS,
  IDENTITY_SETTINGS_KEYS,
} from "./stateSchema.js";

function expectKeys(obj, allowedKeys, label) {
  expect(Object.keys(obj).sort(), label).toEqual([...allowedKeys].sort());
}

describe("AppContext — forma estática de state", () => {
  it("defaultState solo tiene las claves top-level de STATE_KEYS", () => {
    expectKeys(defaultState, STATE_KEYS, "state");
  });

  it("device (DEFAULT_DEVICE_STATE) solo tiene las claves de DEVICE_KEYS", () => {
    expectKeys(DEFAULT_DEVICE_STATE, DEVICE_KEYS, "device");
    expectKeys(DEFAULT_DEVICE_STATE.settings, DEVICE_SETTINGS_KEYS, "device.settings");
    expectKeys(DEFAULT_DEVICE_STATE.coach, DEVICE_COACH_KEYS, "device.coach");
  });

  it("auth (DEFAULT_AUTH_STATE) solo tiene las claves de AUTH_KEYS", () => {
    expectKeys(DEFAULT_AUTH_STATE, AUTH_KEYS, "auth");
    expectKeys(DEFAULT_AUTH_STATE.biometric, AUTH_BIOMETRIC_KEYS, "auth.biometric");
  });

  it("identity (DEFAULT_IDENTITY_STATE) solo tiene las claves de IDENTITY_KEYS", () => {
    expectKeys(DEFAULT_IDENTITY_STATE, IDENTITY_KEYS, "identity");
    expectKeys(DEFAULT_IDENTITY_STATE.user, IDENTITY_USER_KEYS, "identity.user");
    expectKeys(DEFAULT_IDENTITY_STATE.settings, IDENTITY_SETTINGS_KEYS, "identity.settings");
  });

  it("pointsLog está declarado explícitamente en el schema (ya no es ad hoc)", () => {
    expect(IDENTITY_KEYS).toContain("pointsLog");
    expect(DEFAULT_IDENTITY_STATE.pointsLog).toEqual([]);
  });
});

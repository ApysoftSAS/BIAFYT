/**
 * VOUCHERS del atleta: lista los suyos con su código y estado, y canjea un
 * código compartido mostrando errores en español.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Vouchers from "./Vouchers.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../state/AppContext.jsx", () => ({ useApp: () => ({ state: { auth: { token: "tok" } } }) }));

const list = vi.fn();
const claim = vi.fn();
vi.mock("../utils/api.js", async () => {
  const actual = await vi.importActual("../utils/api.js");
  return { ...actual, apiGetMyVouchers: (...a) => list(...a), apiClaimVoucherCode: (...a) => claim(...a) };
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const setValue = (el, value) => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const issued = { id: 1, code: "VCH-ABC123XYZ789", title: "Clase gratis", benefit_type: "percent", benefit_value: 20, benefit_description: "x", applies_to: "Mensualidad", status: "issued", expires_at: "2026-11-21T04:59:59Z", gym: { id: 3, name: "KAIROS" } };
const used = { id: 2, code: "VCH-USED", title: "Valoración", benefit_type: "text", benefit_description: "Una valoración", status: "redeemed", redeemed_at: "2026-11-10T15:00:00Z", coach: { id: 5, name: "Carlos" } };

describe("Vouchers (atleta)", () => {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.clearAllMocks();
    list.mockResolvedValue({ vouchers: [issued, used], next_cursor: null, has_more: false });
  });
  afterEach(() => container.remove());

  it("muestra el código solo de los vigentes, con quién lo da y hasta cuándo", async () => {
    await act(async () => { createRoot(container).render(<Vouchers onBack={() => {}} />); });
    await flush();

    expect(container.textContent).toContain("Clase gratis");
    expect(container.textContent).toContain("20% de descuento");
    expect(container.textContent).toContain("VCH-ABC123XYZ789");
    expect(container.textContent).toContain("KAIROS");
    expect(container.textContent).toContain("Válido hasta el");
    expect(container.textContent).toContain("Vigente");
    expect(container.textContent).toContain("Usado");
    expect(container.textContent).not.toContain("VCH-USED"); // el usado ya no enseña código
    expect(container.textContent).toContain("Carlos");
  });

  it("canjea un código (normalizado en mayúsculas), avisa y recarga la lista", async () => {
    claim.mockResolvedValue({ voucher: { title: "Promo verano" } });
    await act(async () => { createRoot(container).render(<Vouchers onBack={() => {}} />); });
    await flush();

    await act(async () => setValue(container.querySelector("input"), "verano 30!"));
    expect(container.querySelector("input").value).toBe("VERANO30");
    await act(async () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();

    expect(claim).toHaveBeenCalledWith("tok", "VERANO30");
    expect(container.textContent).toContain("«Promo verano» ya está en tu lista");
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("traduce los errores del canje", async () => {
    claim.mockRejectedValue({ status: 422, errors: { code: ["This code has no claims left."] } });
    await act(async () => { createRoot(container).render(<Vouchers onBack={() => {}} />); });
    await flush();

    await act(async () => setValue(container.querySelector("input"), "AGOTADO"));
    await act(async () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();

    expect(container.textContent).toContain("ya no tiene cupos");
  });

  it("sin vouchers explica cómo conseguirlos", async () => {
    list.mockResolvedValue({ vouchers: [], next_cursor: null, has_more: false });
    await act(async () => { createRoot(container).render(<Vouchers onBack={() => {}} />); });
    await flush();
    expect(container.textContent).toContain("Aún no tienes vouchers");
  });
});

/**
 * BIAFYT — PLANES
 * Catálogo estático de planes disponibles. La adquisición es simulada
 * (sin pagos reales ni pasarela) — ver AppContext.selectPlan().
 */

export const plans = [
  {
    id: "plan-free",
    name: "Plan Gratuito",
    description: "Acceso a la app con las funciones esenciales.",
    price: 0,
    periodicity: "Gratis",
    benefits: ["Rutinas guiadas", "Ranking y duelos", "Biblioteca de máquinas"],
    active: true,
  },
  {
    id: "plan-mensual",
    name: "Plan Mensual",
    description: "Para quienes entrenan de forma constante.",
    price: 29900,
    periodicity: "Mensual",
    benefits: ["Todo lo del plan gratuito", "Prioridad en duelos", "Descuentos en premios"],
    active: true,
  },
  {
    id: "plan-premium",
    name: "Plan Premium",
    description: "La experiencia completa de BIAFYT.",
    price: 79900,
    periodicity: "Mensual",
    benefits: ["Todo lo del plan mensual", "Acceso anticipado a retos", "Insignia premium"],
    active: true,
  },
];

export function findPlan(id) {
  return plans.find((p) => p.id === id) || null;
}

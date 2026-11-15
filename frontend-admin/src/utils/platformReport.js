import { csvCell, hourLabel } from "./report.js";

const row = (...cells) => cells.map(csvCell).join(";");

/** Reporte de plataforma → CSV por secciones (`;` y BOM lo pone `downloadText`). */
export function platformToCsv(report) {
  const { period: p, totals: t, active_users: a, queues: q } = report;
  return [
    row("Reporte de plataforma BIAFYT"),
    row("Periodo", `${p.from} a ${p.to} (${p.days} días)`),
    row("Zona horaria", p.timezone),
    "",
    row("Indicador", "Valor"),
    row("Usuarios", t.users),
    row("Usuarios nuevos (periodo)", t.new_users),
    row("Gimnasios", t.gyms),
    row("Gimnasios nuevos (periodo)", t.new_gyms),
    row("Miembros en gimnasios", t.members),
    row("Coaches", t.coaches),
    row("Staff", t.staff),
    row("Usuarios activos (periodo)", t.active_users_period),
    row("Usuarios activos hoy", a.today),
    row("Usuarios activos últimos 7 días", a.last_7_days),
    row("Usuarios activos últimos 30 días", a.last_30_days),
    row("Check-ins (periodo)", t.check_ins),
    row("Entrenamientos (periodo)", t.workouts),
    row("Duelos terminados (periodo)", t.duels_finished),
    row("Vouchers emitidos (periodo)", t.vouchers_issued),
    row("Vouchers usados (periodo)", t.vouchers_redeemed),
    row("Promociones activas", t.promotions_active),
    "",
    row("Fecha", "Usuarios nuevos", "Check-ins"),
    ...report.new_users_by_day.map((d, i) => row(d.date, d.count, report.check_ins_by_day[i]?.count ?? 0)),
    "",
    row("Hora", "Check-ins"),
    ...report.check_ins_by_hour.map((n, h) => row(hourLabel(h), n)),
    "",
    row("Gimnasio", "Miembros", "Coaches", "Check-ins", "Miembros que asistieron"),
    ...report.top_gyms.map((g) => row(g.name, g.members, g.coaches, g.check_ins, g.active_members)),
    "",
    row("Cola", "Estado", "Cantidad"),
    ...Object.entries(q.gym_registrations).map(([s, n]) => row("Registro de gimnasio", s, n)),
    ...Object.entries(q.equipment_requests).map(([s, n]) => row("Solicitud de equipo", s, n)),
  ].join("\r\n");
}

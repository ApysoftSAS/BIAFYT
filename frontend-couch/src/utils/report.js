/** Lógica pura de la pantalla Reportes (con test en `report.test.js`). */

export const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]; // índice 0 = lunes (como el backend)

export const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;

/** "2026-11-18" → "18 nov" (sin desfase de zona: se arma como fecha local). */
export function shortDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es", { day: "numeric", month: "short" }).replace(".", "");
}

/** "2026-10-08" → "8 oct 2026". Fecha sin hora = día calendario local (no UTC: evita el desfase de un día). */
export function dayLabel(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }).replaceAll(".", "");
}

/**
 * Techo "redondo" del eje Y (1, 2, 5 × 10ⁿ), mínimo 4 para que un valor de 1
 * no llene todo el eje.
 */
export function niceMax(value) {
  if (!(value > 4)) return 4;
  const p = 10 ** Math.floor(Math.log10(value));
  const n = value / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/**
 * Horas que muestra el mapa de calor: las que tienen datos ± 1, con un
 * mínimo de 6 columnas. Sin datos: 6–22 (horario típico de un gimnasio).
 * @param {number[][]} matrix [día][hora]
 * @returns {[number, number]} [primera hora, última hora] inclusive
 */
export function hourRange(matrix) {
  let lo = 24;
  let hi = -1;
  matrix.forEach((row) =>
    row.forEach((n, h) => {
      if (n > 0) {
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    })
  );
  if (hi < 0) return [6, 22];
  lo = Math.max(0, lo - 1);
  hi = Math.min(23, hi + 1);
  while (hi - lo < 5) {
    if (lo > 0) lo -= 1;
    if (hi - lo < 5 && hi < 23) hi += 1;
  }
  return [lo, hi];
}

/** Nivel de intensidad 0..5 de una celda (0 = sin datos). */
export const heatLevel = (value, max) => (value > 0 && max > 0 ? Math.max(1, Math.ceil((value / max) * 5)) : 0);

export const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** "75" → "1 h 15 min"; null → "—". */
export function minutesLabel(min) {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ------------------------------------------------------------------
// EXPORTACIÓN CSV
// ------------------------------------------------------------------

/** Celda CSV: comillas si hace falta y neutraliza fórmulas (=, +, -, @) que Excel ejecutaría. */
export function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (...cells) => cells.map(csvCell).join(";");

/**
 * Reporte → texto CSV por secciones. Separador `;` y decimales con coma: es
 * lo que abre bien Excel en español (Colombia). El BOM UTF-8 lo añade el
 * descargador para conservar las tildes.
 */
export function reportToCsv(report, gymName = "") {
  const { period: p, totals: t } = report;
  const dec = (n) => (n == null ? "" : String(n).replace(".", ","));
  const branch = report.branch_id ? report.by_branch.find((b) => b.id === report.branch_id)?.name : null;
  const out = [
    row("Reporte de asistencia", gymName),
    row("Periodo", `${p.from} a ${p.to} (${p.days} días)`),
    row("Sede", branch ?? "Todas"),
    row("Zona horaria", p.timezone),
    row("Nota", "Basado en check-ins hechos en la app BIAFYT, atribuidos al gimnasio por membresía activa. No es un conteo de acceso físico."),
    "",
    row("Indicador", "Valor"),
    row("Miembros activos", t.members),
    row("Miembros nuevos", t.new_members),
    row("Miembros que asistieron", t.active_members),
    row("Miembros sin asistir", t.inactive_members),
    row("Check-ins del periodo", t.check_ins),
    row("Check-ins hoy", t.check_ins_today),
    row("Dentro ahora (estimado)", t.inside_now_estimate),
    row("Visitas por miembro activo", dec(t.visits_per_active_member)),
    row("Permanencia promedio (min)", t.avg_stay_minutes ?? ""),
    row("Entrenamientos registrados", t.workouts),
    row("Duración promedio de entrenamiento (min)", t.avg_workout_minutes ?? ""),
    "",
    row("Hora", "Check-ins"),
    ...report.by_hour.map((n, h) => row(hourLabel(h), n)),
    "",
    row("Día / hora", ...report.by_hour.map((_, h) => hourLabel(h))),
    ...report.by_weekday_hour.map((cells, d) => row(WEEKDAYS[d], ...cells)),
    "",
    row("Fecha", "Check-ins"),
    ...report.by_day.map((d) => row(d.date, d.check_ins)),
    "",
    row("Sede", "Miembros", "Check-ins", "Miembros que asistieron"),
    ...report.by_branch.map((b) => row(b.name, b.members, b.check_ins, b.active_members)),
    "",
    row("Miembro sin asistir", "Sede", "Último check-in", "Días sin asistir", "Miembro desde"),
    ...report.inactive_members.map((m) =>
      row(m.user.name, m.branch?.name ?? "", m.last_check_in_date ?? "Nunca", m.days_since ?? "", m.member_since)
    ),
  ];
  return out.join("\r\n");
}

/** Descarga un texto como archivo (CSV con BOM UTF-8). Solo navegador. */
export function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob(["\uFEFF", text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

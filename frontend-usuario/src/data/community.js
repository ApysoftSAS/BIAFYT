/**
 * BIAFYT — RETOS DIARIOS, NOTICIAS Y PROMOCIONES
 * ---------------------------------------------------------------
 * Las noticias y promociones representan contenido publicado por el
 * administrador del gimnasio. En la demo son datos locales; en
 * producción vendrían del panel B2B filtrados por gimnasio/sede.
 */

/** Tipos de reto diario. `metric` se compara contra el progreso del día. */
export const dailyChallengeTemplates = [
  { id: "dc-checkin", title: "Haz check-in hoy", detail: "Registra tu llegada al gimnasio.", metric: "checkin", target: 1, reward: 30, icon: "📍" },
  { id: "dc-sets", title: "Completa 12 series", detail: "En una o varias sesiones del día.", metric: "sets", target: 12, reward: 60, icon: "🔁" },
  { id: "dc-workout", title: "Termina un entrenamiento", detail: "Cierra una rutina completa.", metric: "workouts", target: 1, reward: 80, icon: "✅" },
  { id: "dc-duration", title: "Entrena 30 minutos", detail: "Tiempo acumulado del día.", metric: "minutes", target: 30, reward: 70, icon: "⏱" },
  { id: "dc-validated", title: "Una sesión validada", detail: "Con GPS en tu sede.", metric: "validated", target: 1, reward: 100, icon: "🛡" },
  { id: "dc-machines", title: "Consulta 2 máquinas", detail: "Aprende algo nuevo hoy.", metric: "machinesViewed", target: 2, reward: 25, icon: "📖" },
];

/**
 * Selecciona los retos del día de forma determinista, para que no
 * cambien al recargar la pantalla.
 */
export function dailyChallengesFor(dateKey, count = 3) {
  const seed = [...dateKey].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const pool = [...dailyChallengeTemplates];
  const picked = [];
  for (let i = 0; i < count && pool.length; i++) {
    const index = (seed * (i + 7)) % pool.length;
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

/** Publicaciones del administrador. */
export const adminPosts = [
  {
    id: "post-1",
    type: "promocion",
    gymId: "gym-kairos-bog",
    title: "2x1 EN MEMBRESÍA ANUAL",
    summary: "Trae a un amigo y ambos entrenan un año por el precio de uno.",
    body: "Durante todo el mes, si renuevas tu membresía anual puedes traer a un acompañante sin costo adicional. Aplica para nuevas afiliaciones y renovaciones. Acércate a recepción con tu documento y el de tu invitado.",
    cta: "Válido hasta fin de mes",
    publishedAt: "2026-08-18T09:00:00.000Z",
    pinned: true,
  },
  {
    id: "post-2",
    type: "noticia",
    gymId: "gym-kairos-bog",
    title: "NUEVA ZONA DE PESO LIBRE — SEDE NORTE",
    summary: "Ampliamos 120 m² con racks, plataformas y barras olímpicas.",
    body: "La nueva zona abre este lunes en el segundo piso de la sede Norte. Incluye cuatro racks de potencia, dos plataformas de levantamiento y un set completo de mancuernas hasta 50 kg. Los primeros días habrá entrenadores acompañando para explicar el uso correcto del espacio.",
    publishedAt: "2026-08-20T14:30:00.000Z",
    pinned: false,
  },
  {
    id: "post-3",
    type: "evento",
    gymId: "gym-kairos-bog",
    title: "RETO BIAFYT 30 DÍAS",
    summary: "Inscripciones abiertas. Premio para los tres primeros de cada sede.",
    body: "Un mes, un objetivo: constancia. Quien acumule más entrenamientos validados durante 30 días se lleva tres meses gratis. Segundo y tercer lugar reciben un mes y una valoración física respectivamente. Inscríbete desde la app o en recepción.",
    cta: "Inscripciones hasta el viernes",
    publishedAt: "2026-08-21T11:00:00.000Z",
    pinned: true,
  },
  {
    id: "post-4",
    type: "noticia",
    gymId: "gym-kairos-bog",
    title: "CAMBIO DE HORARIO — FESTIVO",
    summary: "El lunes festivo abrimos de 8:00 a 14:00 en todas las sedes.",
    body: "Por el festivo, las tres sedes operarán en horario reducido de 8:00 a 14:00. Las clases dirigidas de la tarde se reprograman para el martes en el mismo horario. Las reservas afectadas se liberan automáticamente.",
    publishedAt: "2026-08-22T08:00:00.000Z",
    pinned: false,
  },
  {
    id: "post-5",
    type: "promocion",
    gymId: "gym-titan-bog",
    title: "SEMANA DE PUERTAS ABIERTAS",
    summary: "Invita a quien quieras: entrada libre toda la semana.",
    body: "Cualquier persona puede acompañarte a entrenar esta semana sin costo. Solo debe registrarse en recepción con documento de identidad.",
    publishedAt: "2026-08-19T10:00:00.000Z",
    pinned: false,
  },
];

export const POST_TYPES = {
  noticia: { label: "Noticia", tone: "default" },
  promocion: { label: "Promoción", tone: "accent" },
  evento: { label: "Evento", tone: "success" },
};

/** Publicaciones visibles para el gimnasio del usuario. */
export function postsFor(gymId) {
  return adminPosts
    .filter((p) => !p.gymId || p.gymId === gymId)
    .slice()
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });
}

/**
 * COLA DE ENVÍO (outbox) — las escrituras al backend (actividad, check-in,
 * check-out, reto, premio) que fallan por red o por un error 5xx/429 se guardan
 * en localStorage y se reintentan, EN ORDEN, hasta que el backend las acepta.
 *
 *  - Un 4xx (validación, "ya hiciste check-in hoy"…) NO se reintenta: se descarta.
 *  - Un 401 deja el trabajo en la cola (se reintenta cuando haya sesión de nuevo).
 *  - Si ya hay algo pendiente, lo nuevo se encola detrás para no romper el orden
 *    (un check-out nunca debe llegar antes de su check-in).
 *  - Cada trabajo es del usuario que lo creó: nunca se envía con otra sesión.
 *  - Reintentar es seguro: el backend es idempotente (client_uid en actividades,
 *    un check-in por día, un canje por reto/premio).
 */
export const OUTBOX_KEY = "biafyt.outbox.v1";
const MAX_JOBS = 200;

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(OUTBOX_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const write = (queue) => {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue.slice(-MAX_JOBS)));
  } catch {
    /* sin almacenamiento: se pierde la cola, igual que antes de existir */
  }
};

export const pendingCount = (userId) => read().filter((j) => j.userId === userId).length;

/** Sin respuesta (0), saturado (429) o error del servidor (5xx): vale la pena reintentar. */
export const isRetryable = (err) => typeof err?.status === "number" && (err.status === 0 || err.status === 429 || err.status >= 500);

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function enqueue(userId, kind, body) {
  write([...read(), { id: uid(), userId, kind, body, at: new Date().toISOString() }]);
}

let flushing = false;

/** Envía lo pendiente del usuario, en orden. Devuelve cuántos trabajos se resolvieron. */
export async function flush(userId, run) {
  if (flushing) return 0;
  flushing = true;
  let done = 0;
  try {
    for (;;) {
      const job = read().find((j) => j.userId === userId);
      if (!job) break;
      try {
        await run(job);
      } catch (err) {
        if (isRetryable(err) || err?.status === 401) break; // se queda para el próximo intento
        // 4xx definitivo: se descarta
      }
      write(read().filter((j) => j.id !== job.id));
      done++;
    }
  } finally {
    flushing = false;
  }
  return done;
}

/** Borra lo pendiente de un usuario (cierre de sesión explícito: no dejar sus datos en el dispositivo). */
export function clearUser(userId) {
  write(read().filter((j) => j.userId !== userId));
}

/**
 * Envía ahora o, si no se puede, encola. Devuelve `{ queued: false, data }` si el
 * backend respondió, `{ queued: true }` si quedó pendiente; un 4xx se relanza.
 */
export async function submit(userId, kind, body, run) {
  if (pendingCount(userId) > 0) {
    enqueue(userId, kind, body);
    return { queued: true };
  }
  try {
    return { queued: false, data: await run({ kind, body }) };
  } catch (err) {
    if (!isRetryable(err)) throw err;
    enqueue(userId, kind, body);
    return { queued: true };
  }
}

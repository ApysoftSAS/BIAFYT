/**
 * BIAFYT — INTEGRACIÓN TIKTOK (Display API + Embed Player)
 * ---------------------------------------------------------------
 * Hoy solo construye la URL del reproductor oficial; no hay llamadas de
 * red todavía. El video nunca se descarga ni se almacena: siempre queda
 * alojado en TikTok y se reproduce con su player embebido oficial.
 */

/** URL del TikTok Embed Player oficial para un id de video de TikTok. */
export function tiktokPlayerUrl(tiktokVideoId) {
  return `https://www.tiktok.com/player/v1/${tiktokVideoId}`;
}

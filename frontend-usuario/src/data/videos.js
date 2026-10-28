/**
 * BIAFYT — VIDEOS DE COACHES (TikTok Display API)
 * ---------------------------------------------------------------
 * Cada entrada representa un video público de TikTok de un coach de
 * BIAFYT. Es un mock, pero su forma es la que esperamos recibir de
 * la API real, para poder sustituirla sin rehacer la UI:
 *
 *   `tiktok`     → SOLO campos reales de TikTok Display API
 *                  (scope video.list / video.query): id, title,
 *                  video_description, cover_image_url, embed_link,
 *                  share_url, duration, create_time, like_count,
 *                  comment_count, share_count, view_count.
 *                  TikTok no entrega categoría, músculo, máquina ni
 *                  nivel de entrenamiento — no se inventan aquí.
 *
 *   `BIAFYT`  → metadata propia de la app, NO proviene de TikTok.
 *                  Hoy va vacía; en el futuro podrá asociar el video
 *                  a un ejercicio/máquina (p. ej. Máquinas → Press de
 *                  pecho → este video), sin que eso implique que
 *                  TikTok provee esa relación.
 *
 * El video nunca se descarga: solo se guarda su id de TikTok para
 * reproducirlo después con el Embed Player oficial (ver utils/tiktok.js).
 */

export const videos = [
  {
    id: "video-carlos-pecho",
    coachId: "coach-carlos",
    tiktok: {
      id: "7312345678901234567",
      title: "Rutina de pecho",
      video_description: "Rutina de pecho para principiantes 🔥 3 series x 12 reps.",
      cover_image_url: null,
      embed_link: "https://www.tiktok.com/@carlos.fit/video/7312345678901234567",
      share_url: "https://www.tiktok.com/@carlos.fit/video/7312345678901234567",
      duration: 34,
      create_time: 1717000000,
      like_count: 812,
      comment_count: 44,
      share_count: 19,
      view_count: 15400,
    },
    BIAFYT: {
      category: null,
      exerciseId: null,
      machineId: null,
      focusId: null,
    },
  },
  {
    id: "video-carlos-tecnica",
    coachId: "coach-carlos",
    tiktok: {
      id: "7312345678901234998",
      title: "Corrige tu técnica en sentadilla",
      video_description: "Los 3 errores más comunes al sentadillar y cómo corregirlos.",
      cover_image_url: null,
      embed_link: "https://www.tiktok.com/@carlos.fit/video/7312345678901234998",
      share_url: "https://www.tiktok.com/@carlos.fit/video/7312345678901234998",
      duration: 51,
      create_time: 1718000000,
      like_count: 2130,
      comment_count: 96,
      share_count: 58,
      view_count: 41200,
    },
    BIAFYT: {
      category: null,
      exerciseId: null,
      machineId: null,
      focusId: null,
    },
  },
  {
    id: "video-valeria-movilidad",
    coachId: "coach-valeria",
    tiktok: {
      id: "7398765432109876543",
      title: "Movilidad de cadera en 5 minutos",
      video_description: "Rutina rápida de movilidad antes de entrenar piernas.",
      cover_image_url: null,
      embed_link: "https://www.tiktok.com/@valeria.trains/video/7398765432109876543",
      share_url: "https://www.tiktok.com/@valeria.trains/video/7398765432109876543",
      duration: 42,
      create_time: 1719500000,
      like_count: 540,
      comment_count: 21,
      share_count: 12,
      view_count: 9800,
    },
    BIAFYT: {
      category: null,
      exerciseId: null,
      machineId: null,
      focusId: null,
    },
  },
];

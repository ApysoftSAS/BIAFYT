/**
 * BIAFYT — COACHES
 * ---------------------------------------------------------------
 * Un coach es una persona de BIAFYT (misma forma que communityUsers:
 * id/name/initials/gymId) que conecta su cuenta de TikTok mediante
 * TikTok Login Kit. `tiktok` representa la cuenta conectada — hoy es
 * un mock, pero sus campos corresponden a los que devuelve realmente
 * `user.info.basic` (open_id, display_name, avatar_url) y, con el scope
 * `user.info.profile`, también username/bio_description/profile_deep_link.
 * TikTok NO nos entrega si alguien "es coach" o su especialidad — ese
 * rol y el vínculo con BIAFYT son metadata propia de esta app.
 */

export const coaches = [
  {
    id: "coach-carlos",
    name: "Carlos Peña",
    initials: "CP",
    gymId: "gym-kairos-bog",
    tiktok: {
      openId: "mock-open-id-carlos",
      username: "carlos.fit",
      displayName: "Carlos Peña",
      avatarUrl: null, // vendrá de TikTok (avatar_url / avatar_url_100)
    },
  },
  {
    id: "coach-valeria",
    name: "Valeria Ospina",
    initials: "VO",
    gymId: "gym-forja-mde",
    tiktok: {
      openId: "mock-open-id-valeria",
      username: "valeria.trains",
      displayName: "Valeria Ospina",
      avatarUrl: null,
    },
  },
];

export function findCoach(id) {
  return coaches.find((c) => c.id === id) || null;
}

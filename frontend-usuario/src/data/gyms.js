/**
 * BIAFYT — MOCK DE GIMNASIOS (puntos 54, 55, 56, 97)
 * Cada gimnasio: país / ciudad / nombre / dirección / sedes.
 */

export const GYM_STATUS = {
  PROSPECT: "Prospecto",
  CONTACTED: "Contactado",
  EVALUATING: "En evaluación",
  CLIENT: "Cliente",
  NOT_INTERESTED: "No interesado",
};

export const gyms = [
  {
    id: "gym-kairos-bog",
    name: "KAIROS GYM",
    country: "Colombia",
    city: "Bogotá",
    address: "Cra 15 #93-60",
    phone: "+57 601 555 0110",
    website: "kairosgym.co",
    instagram: "@kairosgym",
    status: GYM_STATUS.CLIENT,
    official: true,
    members: 1240,
    branches: [
      { id: "sede-kairos-norte", name: "Norte", address: "Cra 15 #93-60", lat: 4.6769, lng: -74.048, members: 520 },
      { id: "sede-kairos-centro", name: "Centro", address: "Cll 26 #13-19", lat: 4.6126, lng: -74.0705, members: 410 },
      { id: "sede-kairos-chapinero", name: "Chapinero", address: "Cll 63 #11-25", lat: 4.6486, lng: -74.0629, members: 310 },
    ],
  },
  {
    id: "gym-titan-bog",
    name: "TITAN FITNESS",
    country: "Colombia",
    city: "Bogotá",
    address: "Av. Suba #116-20",
    phone: "+57 601 555 0244",
    status: GYM_STATUS.EVALUATING,
    official: true,
    members: 610,
    branches: [
      { id: "sede-titan-suba", name: "Suba", address: "Av. Suba #116-20", lat: 4.7031, lng: -74.0721, members: 340 },
      { id: "sede-titan-colina", name: "Colina", address: "Cll 138 #58-40", lat: 4.7286, lng: -74.0631, members: 270 },
    ],
  },
  {
    id: "gym-forja-mde",
    name: "FORJA CLUB",
    country: "Colombia",
    city: "Medellín",
    address: "Cra 43A #7-50",
    phone: "+57 604 555 0331",
    status: GYM_STATUS.CONTACTED,
    official: true,
    members: 480,
    branches: [
      { id: "sede-forja-poblado", name: "El Poblado", address: "Cra 43A #7-50", lat: 6.2087, lng: -75.5686, members: 300 },
      { id: "sede-forja-laureles", name: "Laureles", address: "Cll 33 #76-15", lat: 6.2447, lng: -75.5951, members: 180 },
    ],
  },
  {
    id: "gym-pulso-cali",
    name: "PULSO CENTER",
    country: "Colombia",
    city: "Cali",
    address: "Av. 6N #23-14",
    phone: "+57 602 555 0412",
    status: GYM_STATUS.PROSPECT,
    official: false,
    members: 210,
    branches: [{ id: "sede-pulso-norte", name: "Norte", address: "Av. 6N #23-14", lat: 3.4712, lng: -76.5251, members: 210 }],
  },
  {
    id: "gym-atlas-cdmx",
    name: "ATLAS PERFORMANCE",
    country: "México",
    city: "Ciudad de México",
    address: "Av. Insurgentes Sur 1602",
    phone: "+52 55 5555 0190",
    status: GYM_STATUS.EVALUATING,
    official: true,
    members: 890,
    branches: [
      { id: "sede-atlas-roma", name: "Roma", address: "Álvaro Obregón 210", lat: 19.4147, lng: -99.1662, members: 500 },
      { id: "sede-atlas-polanco", name: "Polanco", address: "Masaryk 340", lat: 19.4331, lng: -99.1927, members: 390 },
    ],
  },
  {
    id: "gym-iron-mad",
    name: "IRON HOUSE",
    country: "España",
    city: "Madrid",
    address: "Calle de Alcalá 210",
    phone: "+34 910 555 021",
    status: GYM_STATUS.CLIENT,
    official: true,
    members: 730,
    branches: [{ id: "sede-iron-salamanca", name: "Salamanca", address: "Calle de Alcalá 210", lat: 40.4267, lng: -3.6624, members: 730 }],
  },
];

/** Búsqueda por nombre, ciudad o dirección (punto 54). */
export function searchGyms(list, term) {
  const q = term.trim().toLowerCase();
  if (!q) return list;
  return list.filter((g) =>
    [g.name, g.city, g.country, g.address, ...g.branches.map((b) => `${b.name} ${b.address}`)]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

export function findGym(list, gymId) {
  return list.find((g) => g.id === gymId) || null;
}

export function findBranch(gym, branchId) {
  if (!gym) return null;
  return gym.branches.find((b) => b.id === branchId) || null;
}

/**
 * BIAFYT — ILUSTRACIONES DE MÁQUINAS (punto 70)
 * ---------------------------------------------------------------
 * Todas comparten: mismo viewBox (0 0 200 140), mismo grosor de
 * línea, misma dirección (perfil hacia la derecha), mismo fondo y
 * la paleta NEGRO + BLANCO + AMARILLO tomada de las variables CSS.
 * No se usan imágenes genéricas de internet.
 */

const S = {
  frame: { stroke: "var(--c-text)", strokeWidth: 4, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" },
  pad: { fill: "var(--c-primary)" },
  weight: { fill: "var(--c-surface-alt)", stroke: "var(--c-text)", strokeWidth: 3 },
  body: { stroke: "var(--c-text-secondary)", strokeWidth: 3, fill: "none", strokeLinecap: "round" },
};

function Base({ children }) {
  return (
    <svg viewBox="0 0 200 140" className="machine-art" role="img" aria-hidden="true">
      <rect x="0" y="0" width="200" height="140" fill="var(--c-surface)" />
      <line x1="16" y1="124" x2="184" y2="124" stroke="var(--c-border-strong)" strokeWidth="4" strokeLinecap="round" />
      {children}
    </svg>
  );
}

const arts = {
  chestPress: (
    <>
      <path d="M60 124V70" {...S.frame} />
      <rect x="46" y="40" width="16" height="46" rx="6" {...S.pad} />
      <path d="M62 52h34M62 74h34" {...S.frame} />
      <path d="M96 44v46" {...S.frame} />
      <rect x="128" y="46" width="30" height="52" rx="4" {...S.weight} />
      <path d="M96 62h32" {...S.frame} />
      <circle cx="54" cy="34" r="8" {...S.body} />
    </>
  ),
  latPulldown: (
    <>
      <path d="M40 124V26h96" {...S.frame} />
      <path d="M100 26v22" {...S.frame} />
      <path d="M78 48h44" {...S.frame} />
      <rect x="52" y="82" width="40" height="14" rx="6" {...S.pad} />
      <path d="M60 96v28" {...S.frame} />
      <rect x="26" y="60" width="26" height="46" rx="4" {...S.weight} />
      <circle cx="72" cy="66" r="8" {...S.body} />
      <path d="M72 74v10" {...S.body} />
    </>
  ),
  legPress: (
    <>
      <path d="M36 124l28-30" {...S.frame} />
      <rect x="30" y="86" width="46" height="14" rx="6" transform="rotate(-16 30 86)" {...S.pad} />
      <path d="M84 96l44-40" {...S.frame} />
      <rect x="122" y="34" width="44" height="16" rx="4" transform="rotate(-16 122 34)" {...S.weight} />
      <path d="M118 74l22-20" {...S.frame} />
      <circle cx="52" cy="72" r="8" {...S.body} />
    </>
  ),
  seatedRow: (
    <>
      <path d="M32 124V60" {...S.frame} />
      <rect x="24" y="40" width="26" height="40" rx="4" {...S.weight} />
      <path d="M50 78h72" {...S.frame} />
      <rect x="118" y="70" width="14" height="18" rx="5" {...S.pad} />
      <rect x="132" y="86" width="42" height="12" rx="6" {...S.pad} />
      <path d="M150 98v26" {...S.frame} />
      <circle cx="146" cy="60" r="8" {...S.body} />
      <path d="M146 68v14" {...S.body} />
    </>
  ),
  legExtension: (
    <>
      <path d="M52 124V78" {...S.frame} />
      <rect x="46" y="58" width="42" height="14" rx="6" {...S.pad} />
      <path d="M88 64V40" {...S.frame} />
      <path d="M88 72h40" {...S.frame} />
      <rect x="124" y="64" width="14" height="20" rx="6" {...S.pad} />
      <rect x="26" y="80" width="24" height="34" rx="4" {...S.weight} />
      <circle cx="76" cy="42" r="8" {...S.body} />
    </>
  ),
  legCurl: (
    <>
      <path d="M56 124V82" {...S.frame} />
      <rect x="44" y="66" width="58" height="14" rx="6" {...S.pad} />
      <path d="M102 74h28" {...S.frame} />
      <rect x="128" y="44" width="14" height="22" rx="6" {...S.pad} />
      <path d="M130 66l-4 10" {...S.frame} />
      <rect x="24" y="70" width="22" height="42" rx="4" {...S.weight} />
      <circle cx="52" cy="58" r="8" {...S.body} />
    </>
  ),
  shoulderPress: (
    <>
      <path d="M64 124V52" {...S.frame} />
      <rect x="52" y="70" width="16" height="34" rx="6" {...S.pad} />
      <path d="M68 44h36M68 60h36" {...S.frame} />
      <path d="M104 36v40" {...S.frame} />
      <rect x="134" y="40" width="28" height="56" rx="4" {...S.weight} />
      <path d="M104 52h30" {...S.frame} />
      <circle cx="60" cy="40" r="8" {...S.body} />
    </>
  ),
  cableStation: (
    <>
      <path d="M40 124V28M160 124V28M40 28h120" {...S.frame} />
      <path d="M64 28v40M136 28v40" {...S.frame} />
      <rect x="54" y="68" width="20" height="10" rx="4" {...S.pad} />
      <rect x="126" y="68" width="20" height="10" rx="4" {...S.pad} />
      <rect x="86" y="76" width="28" height="40" rx="4" {...S.weight} />
      <circle cx="100" cy="52" r="8" {...S.body} />
    </>
  ),
  treadmill: (
    <>
      <path d="M46 124l14-40h84l-10 40z" {...S.frame} />
      <path d="M144 84V40h-26" {...S.frame} />
      <rect x="96" y="32" width="24" height="12" rx="5" {...S.pad} />
      <path d="M60 104h74" {...S.frame} />
      <circle cx="88" cy="60" r="8" {...S.body} />
      <path d="M88 68l-10 16M88 68l14 14" {...S.body} />
    </>
  ),
  hipThrust: (
    <>
      <path d="M36 124V86h56" {...S.frame} />
      <rect x="34" y="72" width="58" height="14" rx="6" {...S.pad} />
      <path d="M92 86l28 14" {...S.frame} />
      <circle cx="126" cy="72" r="16" {...S.weight} />
      <path d="M120 100l14 24" {...S.frame} />
      <circle cx="60" cy="58" r="8" {...S.body} />
    </>
  ),
};

export default function MachineArt({ art }) {
  return <Base>{arts[art] ?? arts.chestPress}</Base>;
}

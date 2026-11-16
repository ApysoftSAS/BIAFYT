/**
 * Genera la biblioteca de ejercicios desde el dataset hasaneyldrm/exercises-dataset
 * (datos MIT; imágenes/GIF © Gym visual — ver THIRD_PARTY_NOTICES.md).
 *
 *   node scripts/build-exercise-library.mjs <carpeta-del-dataset>
 *
 * - Escribe src/data/exerciseLibrary.json (solo español, compacto).
 * - Copia las miniaturas a public/exercise-media/img/.
 * - NO copia los GIF (127 MB) salvo con --gifs (solo para verlos en local; la carpeta
 *   public/exercise-media/gif/ está en .gitignore). En producción se sirven desde
 *   VITE_EXERCISE_GIF_BASE_URL.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const src = resolve(process.argv[2] ?? "");
const raw = JSON.parse(readFileSync(join(src, "data", "exercises.json"), "utf-8"));
if (!Array.isArray(raw) || raw.length === 0) throw new Error("exercises.json vacío o con formato inesperado");

const outJson = resolve("src/data/exerciseLibrary.json");
const outImg = resolve("public/exercise-media/img");
const outGif = resolve("public/exercise-media/gif");
const withGifs = process.argv.includes("--gifs");
mkdirSync(outImg, { recursive: true });
if (withGifs) mkdirSync(outGif, { recursive: true });

/**
 * Tipo de prescripción (mismo contrato que data/exercises.js): el dataset no lo trae.
 *  - cardio: categoría "cardio" del dataset (dato explícito).
 *  - iso (isométrico = se prescribe por segundos de sostén, no por repeticiones):
 *    estiramientos ESTÁTICOS y sostenes estáticos revisados uno a uno. Se excluyen
 *    los dinámicos (con movimiento) aunque el nombre contenga "stretch"/"plank".
 *  - fuerza: todo lo demás (mismo valor por defecto que ya usa el catálogo básico).
 */
const DYNAMIC_STRETCH = new Set([
  "dynamic chest stretch (male)",
  "weighted stretch lunge",
  "world greatest stretch",
  "rocking frog stretch",
  "circles knee stretch",
  "iron cross stretch",
]);
const STATIC_HOLD_IDS = new Set([
  "2135", // weighted front plank
  "3665", // power point plank
  "3544", // bodyweight incline side plank
  "0705", // side bridge v. 2
  "0668", // rear decline bridge
  "3419", // l-sit on floor
  "3420", // v-sit on floor
  "1297", // isometric chest squeeze
  "0500", // isometric wipers
]);
const kindOf = (x) =>
  x.category === "cardio"
    ? "cardio"
    : STATIC_HOLD_IDS.has(x.id) || (/\bstretch\b/i.test(x.name) && !DYNAMIC_STRETCH.has(x.name))
      ? "iso"
      : "fuerza";

const seen = new Set();
const rows = raw.map((x) => {
  if (seen.has(x.id)) throw new Error(`id duplicado ${x.id}`);
  seen.add(x.id);
  const steps = x.instruction_steps?.es?.length ? x.instruction_steps.es : [x.instructions?.es].filter(Boolean);
  if (!steps.length) throw new Error(`sin instrucciones en español: ${x.id}`);
  const file = `${x.id}-${x.media_id}`;
  copyFileSync(join(src, x.image), join(outImg, `${file}.jpg`));
  if (withGifs) copyFileSync(join(src, x.gif_url), join(outGif, `${file}.gif`));
  return {
    id: x.id,
    n: x.name,
    c: x.category,
    q: x.equipment,
    t: x.target,
    m: x.muscle_group,
    s: [...new Set(x.secondary_muscles ?? [])],
    st: steps,
    f: file,
    k: kindOf(x),
  };
});

writeFileSync(outJson, JSON.stringify(rows));
const byKind = rows.reduce((a, r) => ((a[r.k] = (a[r.k] ?? 0) + 1), a), {});
console.log(`${rows.length} ejercicios → ${outJson}`, byKind, withGifs ? "(+ GIF)" : "");

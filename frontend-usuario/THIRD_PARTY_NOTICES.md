# Avisos de terceros — frontend-usuario

## Biblioteca de ejercicios (`src/data/exerciseLibrary.json`, `public/exercise-media/`)

Fuente: https://github.com/hasaneyldrm/exercises-dataset (commit `7455efa`).

- **Datos y textos** (nombres, categorías, músculos, equipo, instrucciones): licencia MIT,
  © 2026 Hasan Emir Yıldırım. Texto completo de la licencia en el repositorio de origen.
- **Imágenes y GIF**: © Gym visual — https://gymvisual.com/. Se usan bajo la licencia que
  BIAFYT obtuvo directamente de Gym visual (clonar el repositorio de origen no concede
  derechos sobre los medios). Se deben mostrar siempre con la atribución
  «© Gym visual — https://gymvisual.com/» (ver `ExerciseLibrary.jsx`) y solo a 180×180.

Regenerar: `node scripts/build-exercise-library.mjs <carpeta-del-dataset>`.
Los GIF (127 MB) no se copian: se sirven desde `VITE_EXERCISE_GIF_BASE_URL`.

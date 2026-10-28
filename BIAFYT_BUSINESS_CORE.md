BIAFYT — BUSINESS CORE
Documento maestro de lógica y reglas de negocio.

Este documento define qué es BIAFYT, quiénes participan, cómo se relacionan Cliente/Usuario, Coach y Gym, cuáles son los conceptos de negocio, qué decisiones ya fueron tomadas y qué cosas todavía NO deben implementarse.

Este documento no es un roadmap técnico, no describe commits concretos y no sustituye PROJECT_STATE.md.

BIAFYT_BUSINESS_CORE.md = qué significa el producto y sus reglas de negocio.
PROJECT_STATE.md = estado real del código, fases, dependencias y deuda técnica.
CLAUDE.md / .claude/ = cómo trabajar en el repositorio.
Regla fundamental: si una implementación futura contradice este documento, debe detenerse y reportar la contradicción antes de modificar código.

1. Visión del producto
   BIAFYT es una plataforma de fitness que conecta tres perspectivas del mismo ecosistema:

Cliente / Usuario / Atleta

Entrena.
Registra actividad.
Acumula puntos.
Mantiene una racha.
Participa en desafíos y duelos.
Puede reclamar recompensas.
Puede formar parte de una comunidad.
Puede relacionarse con un Coach.
Puede pertenecer o estar asociado a un Gym.
Coach

Diseña y administra programas de entrenamiento.
Asigna trabajo a atletas.
Acompaña la progresión del atleta.
Trabaja sobre una relación explícita y autorizada con sus atletas.
No debe tener acceso arbitrario a datos de cualquier usuario.
Gym

Representa la organización/establecimiento deportivo.
Puede tener usuarios asociados.
Puede tener coaches/staff.
Puede tener estructura organizacional y eventualmente sucursales.
Es un contexto organizacional, no simplemente un catálogo de gimnasios.
Estas tres perspectivas deben coexistir dentro del mismo ecosistema, pero no deben mezclarse prematuramente.

2.  Modelo conceptual principal
    BIAFYT debe entenderse como un sistema con tres capas de negocio:

                             BIAFYT
                                 │
                 ┌───────────────┼───────────────┐
                 │               │               │
                 ▼               ▼               ▼
            CLIENTE/USER       COACH            GYM
                 │               │               │
                 │               │               │
                 └───────────────┼───────────────┘
                                 │
                                 ▼
                         ECOSISTEMA FITNESS

El usuario puede existir y obtener valor sin Coach ni Gym.

Coach y Gym agregan capacidades sobre el usuario, pero no deben destruir la experiencia individual.

Por tanto:

El modo solo-user es una experiencia válida por sí misma.

La existencia futura de Coach/Gym no debe obligar a migrar toda la experiencia individual a un modelo organizacional.

3. Identidades y roles
   3.1 Usuario / Cliente / Atleta
   El usuario es la identidad central del producto.

Puede:

crear su cuenta;
mantener su perfil;
realizar entrenamientos;
registrar actividad;
hacer check-in;
acumular puntos;
mantener rachas;
participar en desafíos;
participar en duelos;
reclamar recompensas;
consultar su progreso;
elegir participar o no en determinadas experiencias competitivas/sociales;
eventualmente pertenecer a un Gym;
eventualmente aceptar una relación con un Coach.
"Cliente", "Usuario" y "Atleta" representan la misma identidad base desde perspectivas diferentes:

Usuario = identidad del sistema.
Cliente = perspectiva comercial/producto.
Atleta = perspectiva deportiva/fitness.
No crear tres identidades independientes.

4. Coach
   El Coach es un actor que trabaja sobre uno o más atletas.

Su modelo de acceso debe ser:

Coach
│
├── relación autorizada
│
▼
Atleta

No:

Coach
│
└── puede consultar cualquier User

La relación Coach → Atleta debe ser explícita y autorizada.

4.1 Consentimiento
El acceso de un Coach a datos de un atleta debe estar basado en una relación de consentimiento/autorización.

Esto es especialmente importante porque Coach introduce por primera vez una superficie donde:

un usuario puede leer datos pertenecientes a otro usuario.

La protección contra IDOR debe ser una regla de dominio, no solamente una convención de frontend.

El Coach únicamente puede acceder a los atletas que realmente están dentro de su ámbito autorizado.

5. Gym
   Gym representa el contexto organizacional.

No debe modelarse únicamente como:

gym = {
name,
lat,
lng
}

Ese modelo puede servir para descubrimiento/localización en el frontend, pero el concepto de negocio es mayor.

Un Gym puede eventualmente tener:

organización;
sucursal/branch;
miembros;
coaches;
staff;
administradores;
programas;
atletas;
relaciones organizacionales.
La estructura futura debe permitir distinguir:

Gym / Organization
│
├── Branch
│
├── Coach
│
├── Staff
│
└── Members / Athletes

No asumir que un usuario solamente "selecciona un gimnasio" y eso equivale automáticamente a pertenencia organizacional.

6. Roles de Gym
   Los roles staff y gym_admin existen como intención de dominio. **`gym_admin`
   está ACTIVO desde el slice Gym MVP (D-GYM)** — con autorización real y
   acotada: administra `member`/`coach` (alta por email + revocación) y lee el
   estado sombra de un miembro, SOLO dentro de su propio gym, y NUNCA concede
   `gym_admin`/`staff`. `staff` sigue **dormante**. `gym_admin` se sigue
   concediendo a mano en la BD (sin endpoint). El resto de lo de abajo sigue
   diferido a la Fase 5.

Conceptualmente:

gym_admin
│
└── administra el contexto del Gym

staff
│
└── opera dentro del contexto autorizado del Gym

La existencia de estos roles no significa que ya exista autorización funcional completa.

No implementar authz nueva solamente porque existan las constantes.

Cuando se implemente Gym:

el rol debe estar ligado al Gym correspondiente;
el alcance debe ser organizacional;
un gym_admin de Gym A no debe obtener privilegios administrativos sobre Gym B;
un staff no debe heredar automáticamente permisos de gym_admin;
las capacidades deben definirse explícitamente. 7. Relación Usuario ↔ Gym
Un usuario puede estar asociado a un Gym.

Esta asociación eventualmente podrá tener contexto de:

organización;
branch;
membresía;
estado;
fechas;
permisos/relación;
eventualmente información comercial.
Pero:

seleccionar un Gym en la aplicación no equivale automáticamente a tener una relación backend autoritativa de membresía.

Actualmente existen datos mock de gimnasios en frontend. No asumir que esos datos representan el modelo definitivo del backend.

8. Relación Coach ↔ Gym
   Un Coach puede formar parte de un Gym/organización.

Conceptualmente:

Gym
│
├── Coach A
├── Coach B
└── Coach C

Pero un Coach también puede existir fuera de un Gym.

Por tanto:

Coach y Gym están relacionados, pero no deben convertirse en una sola identidad.

El sistema debe poder soportar:

Coach independiente;
Coach perteneciente a un Gym;
Coach trabajando con atletas de un Gym;
eventualmente Coach trabajando con atletas fuera de ese Gym, siempre respetando autorización. 9. Programas y Workouts
La cadena backend:

Program
↓
Workout
↓
Exercise
↓
WorkoutExercise
↓
ExercisePerformance

representa principalmente programas estructurados de entrenamiento, cuyo hogar natural es el dominio Coach.

La decisión arquitectónica tomada es:

Program/Workout backend = programas de Coach, top-down.

No migrar automáticamente el sistema de rutinas personales del usuario a esta cadena.

10. Rutinas personales / Solo-user
    El usuario puede construir sus propias rutinas mediante:

buildRoutine;
customRoutines;
estructuras equivalentes de experiencia individual.
Estas rutinas pertenecen al modo:

solo-user / entrenamiento personal.

No deben desaparecer simplemente porque exista Program/Workout.

Modelo conceptual:

                    USER
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼

Custom Routine Coach Program
/ Solo-user / Assigned work

El puente entre ambos mundos queda diferido.

No asumir:

CustomRoutine === Program

ni:

todo entrenamiento debe convertirse en Program/Workout

La migración o unificación futura requiere una decisión explícita.

11. Actividad física
    La actividad del usuario es una fuente fundamental de progreso.

El usuario puede registrar:

workouts;
ejercicios;
sets;
performances;
check-ins;
otras actividades contempladas por el dominio.
La actividad puede generar puntos.

La actividad registrada debe respetar las reglas de negocio de puntos vigentes en cada fase.

12. Puntos
    Los puntos representan una métrica de progresión/competencia dentro de BIAFYT.

Actualmente existen dos representaciones históricas:

Frontend
user.points

y:

Backend
SUM(point_transactions.amount)

La meta arquitectónica es que el backend se convierta en la autoridad del saldo.

Pero:

No se debe hacer el flip de autoridad mientras el ledger no represente todas las fuentes reales de puntos y no exista una estrategia de reconciliación/offline adecuada.

13. Ledger de puntos
    El ledger es append-only.

No debe tratarse el saldo como un contador arbitrario que simplemente se incrementa o decrementa.

Conceptualmente:

PointTransaction
user
amount
reason
metadata
timestamp

El saldo se obtiene de las transacciones.

Fuentes actuales/conocidas:

workout_completed;
checkin;
challenge_claimed;
reward_claimed.
Falta incorporar correctamente:

duelos reales.
Los duelos deben convertirse en una fuente real del ledger cuando llegue su fase.

14. Duelos
    Los duelos son una experiencia competitiva real entre usuarios.

No deben implementarse como:

usuario + rival mock + puntos locales

como arquitectura definitiva.

Un duelo real requiere:

User A
│
├── Duel
│
└── User B

Ambos participantes deben ser usuarios reales.

Los resultados del duelo deben poder producir efectos de negocio verificables.

En particular:

Los puntos derivados de duelos deben entrar al ledger real.

Los duelos constituyen una nueva superficie multijugador y no son simplemente otra operación de write-through frontend.

15. Rachas
    BIAFYT tiene dos conceptos distintos que deben mantenerse separados:

15.1 Racha actual
current_streak

Representa la racha activa.

Regla conceptual:

La racha se rompe cuando el usuario deja de cumplir la condición temporal definida por el sistema.

Por tanto, puede disminuir/reiniciarse.

15.2 Récord
longest_streak

Representa el mejor desempeño histórico.

No disminuye.

Conceptualmente:

current_streak = racha actual
longest_streak = récord / mejor racha

No deben presentarse como si fueran la misma métrica.

16. Decisión D2 — semántica de racha
    Decisión tomada:

current_streak = racha actual.

longest_streak = récord / mejor racha.

Esta decisión está tomada pero no implementada todavía.

La implementación se realizará dentro del bloque Puntos.

La racha que alimenta el bono de puntos deberá quedar alineada con esta decisión antes del flip de autoridad.

17. Bono de racha
    El sistema de puntos puede incorporar un bono basado en la racha.

Actualmente D1 añadió paridad entre el cálculo de frontend y backend mediante PointRules.

La regla vigente de negocio incorporada en D1 es equivalente a:

bonus = min(100, streak \* 10)

La implementación actual utiliza la racha visible/local.

Esto es deliberado como estado transitorio.

No interpretar esto como resolución definitiva de la autoridad de racha.

El bloque Puntos deberá:

cerrar la semántica D2;
decidir la fuente autoritativa;
alinear el cálculo;
posteriormente realizar el flip. 18. Rewards
Rewards representa el sistema de recompensas del usuario.

El usuario puede:

visualizar recompensas;
alcanzar condiciones;
eventualmente reclamarlas;
recibir el efecto correspondiente.
D1 implementó la persistencia backend de RewardClaim.

La operación de claim actualmente funciona en modo sombra.

19. Reward Claim
    Un claim de recompensa representa:

User
↓
RewardClaim
↓
Reward

La relación debe ser única por:

(user_id, reward_uid)

El ledger registra:

reward_claimed

como débito cuando la recompensa tiene costo.

20. Recompensas de costo cero
    Existe un gap conocido:

Las recompensas con:

cost = 0

pueden ser reclamadas actualmente sin que backend verifique completamente la condición de desbloqueo.

Ejemplo conceptual:

Reward
cost = 0
unlock condition = rank / duel / achievement

El backend actualmente puede registrar el claim sin verificar esa condición.

Esto es un comportamiento aceptado del modo sombra D1, no una regla definitiva del producto.

Debe resolverse cuando se diseñe la autorización real de Rewards.

No ampliar D1 retroactivamente.

21. Challenge
    Los desafíos son una fuente de progreso y potencialmente de puntos.

Conceptualmente:

Challenge
│
└── User claim

El claim puede producir una transacción:

challenge_claimed

La verificación completa de condiciones debe mantenerse alineada con las reglas de negocio futuras.

22. Ranking
    El Ranking representa competencia/comparación entre usuarios reales.

No debe construirse sobre:

rivales mock;
puntos hardcodeados;
LocalStorage como autoridad;
datos de Gym exclusivamente mock;
rankingOptIn únicamente local.
El Ranking real requiere como mínimo:

Usuarios reales +
Saldo autoritativo +
Visibilidad/opt-in persistente +
Contexto de comunidad +
Gym/branch/city/country cuando corresponda

Por eso:

Ranking real ocurre después del flip de puntos.

El antiguo "Ranking básico" queda descartado como siguiente fase.

23. Comunidad
    La comunidad debe estar formada por usuarios reales.

Los datos actuales de:

communityUsers

son mock y sirven únicamente para la experiencia actual.

No tratarlos como modelo de dominio definitivo.

Un ranking/comunidad real deberá resolver:

quién puede verse;
quién puede competir;
qué información se muestra;
opt-in;
contexto geográfico;
contexto de Gym;
privacidad. 24. Ranking Opt-In
La participación en ranking/comunidad debe ser una decisión explícita del usuario.

Actualmente rankingOptIn está en LocalStorage.

La versión real deberá persistirse en backend.

El principio de negocio es:

Un usuario no debe aparecer en experiencias competitivas/sociales que requieran opt-in simplemente porque el frontend decidió mostrarlo.

25. Privacidad
    BIAFYT debe separar:

"el usuario existe"

de:

"otros usuarios pueden ver sus datos"

La existencia de un User no implica automáticamente visibilidad pública.

Esto es especialmente importante para:

Ranking;
comunidad;
Coach;
Gym. 26. Autorización entre usuarios
La regla general es:

Un usuario puede acceder libremente a sus propios datos dentro de las capacidades permitidas.

Para acceder a datos de otro usuario debe existir una relación o autorización explícita.

Ejemplo:

Coach
↓
Consent / Assignment
↓
Athlete

No:

GET /users/{id}

como mecanismo general para que cualquier usuario consulte atletas.

La prevención de IDOR es parte del diseño de negocio y seguridad.

27. Coach → Athlete
    La relación Coach → Athlete será uno de los primeros dominios donde se necesitará autorización de usuario-a-usuario.

Debe existir una relación explícita.

Posibles estados conceptuales:

requested
pending
accepted
revoked
ended

La implementación concreta (relación de consentimiento) YA existe:
`CoachAthleteRelationship` con máquina `pending → active → revoked`
(`requested`/`accepted`/`ended` se mapean a esos tres). Ver
`PROJECT_STATE.md` → `FASE: CoachAthleteRelationship`.

El slice D-COACH añade el PRIMER uso real de esa relación como
autorización usuario-a-usuario: una relación en estado `active` habilita a
un Coach a LEER datos sombra del atleta (Profile + actividad + racha +
puntos) y a dejarle notas. El gate es una regla de dominio
(`CoachAthleteRelationship::activeBetween`), no una convención de frontend.
Cualquier ampliación del alcance de lectura (programas, workouts, check-ins)
sigue requiriendo una decisión nueva (Fase 5).

28. Coach → Program
    El Coach es el propietario natural de programas estructurados.

Conceptualmente:

Coach
↓
Program
↓
Workout
↓
Exercises

Posteriormente:

Coach
↓
Program
↓
Assignment
↓
Athlete

La asignación debe respetar la relación autorizada Coach → Athlete.

29. Athlete → Program
    Un atleta puede recibir un programa de un Coach.

Esto no significa que todas sus rutinas personales deban convertirse en programas.

Debe mantenerse la separación:

Programa asignado por Coach

vs.

Rutina creada por el usuario

30. Gym → Coach
    Un Gym puede administrar coaches.

Pero el alcance administrativo debe estar ligado al Gym.

Gym A
├── Coach A
└── Coach B

Gym B
└── Coach C

Un administrador de Gym A no debe poder administrar Gym B.

31. Gym → Athlete
    Un Gym puede tener atletas/miembros.

La relación debe distinguirse de:

usuario seleccionó un Gym en frontend

y:

usuario pertenece realmente al Gym

La segunda es una relación de dominio/backend.

32. Gym → Programs
    En el futuro un Gym puede administrar o publicar programas.

Pero esto no cambia la decisión D3:

La cadena Program/Workout sigue siendo principalmente la representación de programas estructurados de Coach.

Si Gym necesita ownership adicional de programas, debe definirse explícitamente si:

el programa pertenece al Coach;
pertenece al Gym;
pertenece a ambos mediante relación;
o existe otro modelo.
No asumir una solución hasta esa fase.

33. Coach y Gym no son lo mismo
    Debe evitarse el error conceptual:

Coach = Gym

y también:

Gym = Coach

Son actores/dominios diferentes.

Un Gym es una organización/contexto.

Un Coach es una persona/actor profesional.

Un Coach puede estar asociado a un Gym.

Un Gym puede tener varios Coaches.

34. Cliente y Gym no son lo mismo
    Tampoco:

User = GymMember

Un usuario puede existir sin Gym.

La pertenencia a un Gym es una relación adicional.

35. Cliente y Coach no son identidades excluyentes
    Un usuario puede eventualmente tener más de un contexto.

Por ejemplo, una misma persona podría ser:

User
├── Athlete
└── Coach

La arquitectura no debe asumir que "Coach" es necesariamente una cuenta completamente diferente.

La forma exacta de soportar multirol deberá definirse cuando llegue Coach/Gym.

36. Experiencia del usuario individual
    El modo solo-user debe permanecer funcional.

Debe poder existir:

User
└── custom routines
└── workouts
└── activity
└── points
└── streak
└── rewards

sin requerir:

Coach
Gym
Membership

Esto protege el núcleo actual del producto.

37. Backend como autoridad futura
    La dirección arquitectónica general es:

Frontend
↓
API
↓
Backend
↓
Domain / DB

Pero la migración de autoridad debe hacerse por dominio y con paridad.

No asumir que "hay endpoint" significa que el backend ya es autoridad.

38. Write-through
    El write-through actual es una estrategia transitoria.

Frontend mantiene experiencia local y envía determinadas operaciones al backend.

D1 amplió esta estrategia a Rewards y racha/puntos.

Esto no significa que LocalStorage sea permanentemente la autoridad.

La transición futura debe ser explícita.

39. Offline / reconciliación
    Antes del flip de autoridad de puntos debe existir una estrategia para:

operaciones offline;
reintentos;
duplicados;
idempotencia;
reconciliación;
conflictos.
No convertir:

LocalStorage → backend

en:

backend acepta cualquier saldo enviado por cliente

La autoridad debe ser calculada a partir de eventos/transacciones verificables.

40. Seguridad
    Principios permanentes:

El cliente no debe ser autoridad para reglas sensibles.
No confiar en user.points enviado desde frontend.
No confiar en streak del cliente para validar una condición sensible.
No permitir acceso cross-user sin autorización.
Las operaciones críticas deben ser idempotentes.
Los claims no deben poder duplicarse.
Los saldos deben derivarse de ledger/eventos.
El contexto de Gym debe respetar organization scope.
Coach debe respetar consent/assignment scope. 41. GPS / Gym / entrenamiento
Actualmente existe lógica de entrenamiento relacionada con ubicación/GPS.

Los datos mock de Gym del frontend tienen información de localización que participa en esa experiencia.

Por ello:

No conectar indiscriminadamente el endpoint real de Gyms al onboarding o Workout mientras la forma de datos y el modelo de pertenencia no estén definidos.

Especialmente:

mock gym lat/lng

no debe sustituirse automáticamente por:

backend Gym

sin resolver el contrato.

42. Analytics
    Analytics.jsx es un archivo protegido dentro de las decisiones actuales del proyecto.

Existe deuda de paridad entre las métricas locales y el dominio backend.

No utilizar Analytics como argumento para hacer un flip parcial de autoridad.

Cuando llegue el bloque Puntos deberá resolverse la paridad necesaria.

43. Billing
    Billing queda fuera del roadmap cercano.

No existe actualmente una implementación real de:

proveedor;
checkout;
suscripciones;
webhooks;
entitlements;
planes;
monetización.
La decisión es:

Billing se aborda después de producción y después de definir la estrategia de monetización.

No diseñar arquitectura de Billing "por si acaso".

44. Modelo comercial futuro
    La monetización deberá decidirse antes de implementar Billing.

Preguntas que deben resolverse en esa fase:

¿B2C?
¿Gym paga?
¿Coach paga?
¿Freemium?
¿Suscripción?
¿Planes?
¿Qué entitlements corresponden a cada plan?
¿Quién es el customer?
¿Quién paga?
¿Quién recibe acceso?
No asumir respuestas.

45. Orden conceptual del producto
    El producto debe crecer en este orden conceptual:

NÚCLEO SOLO-USER
│
▼
PUNTOS COHERENTES
│
▼
COMPETENCIA REAL
│
▼
COMUNIDAD / RANKING
│
├───────────────┐
▼ ▼
COACH GYM
│ │
└───────┬───────┘
▼
ECOSISTEMA
│
▼
BILLING

El orden técnico exacto está en PROJECT_STATE.md, pero este documento define la dependencia conceptual.

46. Decisiones D2–D8
    D2 — Racha canónica
    DECIDIDO — NO IMPLEMENTADO

current_streak = racha actual.
longest_streak = récord/mejor racha.
La implementación corresponde al bloque Puntos.
Debe resolverse antes del flip de autoridad.
D3 — Program / Workout
DECIDIDO — NO IMPLEMENTADO

Program/Workout backend representa programas estructurados de Coach.
buildRoutine/customRoutines permanecen para solo-user.
El puente entre ambos queda diferido.
No migrar rutinas personales automáticamente.
D4 — Flip de puntos
DECIDIDO — NO IMPLEMENTADO

No hacer todavía.

Prerequisitos:

D2;
duelos reales;
duelos conectados al ledger;
reconciliación offline;
paridad necesaria con Analytics;
estrategia de autoridad backend.
D5 — Roles Gym
DECIDIDO — NO IMPLEMENTADO

staff y gym_admin permanecen dormantes.
No crear authz nueva todavía.
No borrar los helpers en esta consolidación.
La implementación real corresponde a Gym.
D6 — Siguiente fase
DECIDIDO

Ranking básico queda descartado como siguiente feature.

El orden aprobado comienza con:

Consolidación
→ MVP Producción
→ Bloque Puntos
→ Ranking real
→ Coach/Gym
→ Billing

D7 — Billing
DECIDIDO — NO IMPLEMENTADO

Billing queda fuera hasta:

MVP producción;
decisión real de monetización.
D8 — Coach/Gym
DECIDIDO — PARCIALMENTE REVISADO POR D-COACH

Coach/Gym se difieren hasta después del bloque Puntos, CON UNA EXCEPCIÓN
explícita: el "Coach MVP slice" (ver D-COACH). El resto de D8 sigue diferido.

Razón (del diferimiento general):

primero deben existir datos de atleta suficientemente reales;
debe resolverse D3;
debe resolverse la autoridad de puntos;
Coach introduce autorización cross-user;
Gym introduce organization scope.

D-COACH — Coach MVP slice
DECIDIDO — IMPLEMENTADO

El usuario autorizó explícitamente adelantar el slice mínimo del dominio Coach,
sobre la foundation (`frontend-couch` Fase 1) y la relación de consentimiento ya
existentes, sin esperar al bloque Puntos. Sub-decisiones:

- D-COACH-1: adelantar el Coach MVP por delante del bloque Puntos y de Ranking
  real. Revisa el orden de D6 y de §47 SOLO para este slice.
- D-COACH-2: se renuncia a la premisa de D8 de "datos de atleta suficientemente
  reales" para este slice. El coach ve datos de calidad sombra/best-effort: el
  Profile es autoritativo, pero actividad/puntos/racha vienen del write-through
  best-effort de la app de usuario y pueden tener huecos offline. Aceptado.
- D-COACH-3: un Coach con una relación coach↔atleta en estado `active` puede
  LEER, y solo leer, el Profile del atleta, un resumen de su actividad, su racha
  (current/longest, regla de §15–§16) y su saldo de puntos. El acceso es por
  atleta, gateado por la relación activa — regla de dominio, no de frontend
  (§26, §27). NO incluye: check-ins crudos / ubicación, rewards, duelos,
  programas/workouts del atleta, ni edición de ningún dato del atleta.
- D-COACH-4: la acción del Coach MVP es una nota de feedback de texto libre
  sobre el atleta, privada del coach. El atleta NO la recibe todavía. NO es un
  Program ni una asignación (§28 sigue diferido).
- D-COACH-5: el rol `coach` se sigue concediendo a mano en la BD (sin endpoint
  de administración de roles — §6, D5 intactos); el atleta se sigue solicitando
  por su id numérico (sin búsqueda de usuarios — §26 intacto).

Lo que D-COACH NO autoriza (sigue diferido a la Fase 5 / D8):
Program assignment (§28–§29), acceso del coach a programas/workouts/check-ins
del atleta, y que el atleta consuma nada de esto en su app.
(La authz de Gym y el lookup por email acotado sí se abrieron después, en
D-GYM — ver abajo.)

D-GYM — Gym MVP slice
DECIDIDO — IMPLEMENTADO

El usuario autorizó explícitamente adelantar el slice mínimo del dominio Gym,
sobre `Gym`/`Branch`/`GymAssignment` y la foundation `frontend-gym-web` ya
existentes, sin esperar al bloque Puntos ni a Ranking. Activa `gym_admin`
(D5 se revisa parcialmente). Sub-decisiones:

- D-GYM-0: activar `gym_admin` y adelantar el Gym MVP como slice explícito,
  por delante del Bloque Puntos y de Ranking. Revisa D5, D6 y §47.
- D-GYM-1: Gym MVP = ver miembros + ver coaches + estado mínimo del miembro +
  alta/revocación de `member`/`coach`. Nada más.
- D-GYM-2: solo `gym_admin` administra usuarios en este MVP. `staff` no.
- D-GYM-3: el `gym_admin` inicial se concede a mano en la BD (§6 se respeta —
  no hay endpoint de administración de `gym_admin`). El `gym_admin` SÍ puede
  conceder/revocar `member` y `coach` a otros usuarios, pero SOLO dentro de
  su propio gym (organization scope, §30) y NUNCA `gym_admin`/`staff`.
- D-GYM-4: Opción A — el `gym_admin` añade personas por email exacto. La app
  del Cliente (`frontend-usuario`) NO se toca; la pertenencia real vive en
  `GymAssignment` aunque la app Cliente no la muestre (§31 se respeta: la
  pertenencia de dominio y la selección local del Cliente siguen separadas).
- D-GYM-5: el `gym_admin` ve de un miembro el mismo snapshot sombra que el
  Coach MVP (Profile + resumen de actividad + racha + puntos). Solo lectura.
  Datos best-effort (§37–§38). NO: email, ubicación, rewards, duelos,
  programas/workouts, notas del coach, edición de nada.
- D-GYM-6: SOLO `frontend-gym-web` (superficie web) entra en el MVP.
  `frontend-gym` (móvil/Capacitor) queda para una fase posterior.
- D-GYM-7: Programs/Workouts/asignaciones de workout quedan 100% fuera
  (D3, §28–§32 sin cambios).
- D-GYM-8: sin endpoint para crear `Gym`/`Branch`/`gym_admin` — bootstrap
  manual.
  ACTUALIZACIÓN (D-GYM-ONBOARDING): revisada. Ya existe un flujo de alta:
  un usuario SOLICITA registrar su gimnasio y un Admin de plataforma
  (BIAFYT Admin) APRUEBA. La aprobación crea `Gym` + `Branch` principal +
  `GymAssignment(gym_admin, active)` para el solicitante, en una transacción
  idempotente. NO existe autoservicio: el usuario nunca se autoasigna
  `gym_admin` ni crea el `Gym` por su cuenta. El comando
  `BIAFYT:grant-gym-admin` se mantiene como herramienta de operaciones.
- D-GYM-9: contradicción documental corregida (ver §"Gym UI Foundation vs
  Gym Product Implementation"): `frontend-gym` es la app MÓVIL (Capacitor),
  `frontend-gym-web` es la app WEB.

Lo que D-GYM NO autoriza (sigue diferido a la Fase 5 / D8):
`Organization` por encima de `Gym`, `Gym` con lat/lng/dirección/estado/miembros
(§5), `staff` operativo, concesión de `gym_admin`/`staff` por API, acceso del
gym a programas/workouts/check-ins del miembro, jerarquía multi-branch real,
permisos granulares, `frontend-gym` móvil, y cualquier cambio en
`frontend-usuario` (salvo el flujo de solicitud de D-GYM-ONBOARDING) o
`frontend-couch`. (La creación de `Gym`/`Branch` por API se abrió después,
acotada al Admin de plataforma — ver D-GYM-ONBOARDING abajo.)

D-GYM-ONBOARDING — Alta de gimnasio + Admin BIAFYT (MVP)
DECIDIDO — IMPLEMENTADO

El usuario autorizó el flujo comercial mínimo de alta:
Usuario → solicita registrar su Gym → solicitud `pending` → un Admin de
plataforma (BIAFYT Admin) aprueba/rechaza → al aprobar se crea
`Gym` + `Branch` principal + `gym_admin` para el solicitante → el usuario
administra su Gym desde Gym Web. Sub-decisiones (asumidas donde el spec del
usuario no las fijaba explícitamente — marcadas ⚠):

- D-GYM-ONB-1: la autoridad de plataforma es un flag booleano
  `users.is_platform_admin`, SEPARADO de `GymAssignment` (no es un rol de
  gym, no vive en `gym_assignments`). Se concede solo por operaciones con
  `php artisan BIAFYT:grant-platform-admin {email} [--revoke]`. NUNCA
  por endpoint, NUNCA por UI. Espeja el patrón de `BIAFYT:grant-gym-admin`.
- D-GYM-ONB-2: `GymRegistrationRequest` es una máquina de estados
  `pending → approved | rejected` (mismo patrón que `CoachAthleteRelationship`:
  sin UNIQUE en BD, "no dos `pending` por usuario" a nivel de aplicación,
  tras un `rejected` el usuario puede volver a solicitar → fila nueva).
- D-GYM-ONB-3: datos de la solicitud = lo estrictamente necesario para
  decidir y crear el Gym: `gym_name`, `branch_name` (sede principal),
  `applicant_message` opcional. ⚠ No se piden dirección/NIT/teléfono: no hay
  regla de negocio que los use todavía (§5 sigue diferido).
- D-GYM-ONB-4: aprobar es idempotente y atómico (`DB::transaction` +
  `lockForUpdate`): si ya está `approved` devuelve el mismo resultado sin
  duplicar; si está `rejected` → 422. Crea `Gym` + `Branch` +
  `GymAssignment(gym_admin, active, branch_id=null)` y sella la solicitud
  con `gym_id`, `reviewed_by_user_id`, `reviewed_at`.
- D-GYM-ONB-5: superficie de administración = un frontend web separado
  `frontend-admin/` (React 19 + Vite, sin Capacitor). ⚠ Separado y no una
  pantalla dentro de Gym Web: audiencia, autoridad y despliegue distintos.
  Alcance MVP: login Sanctum, lista de solicitudes (filtro por estado),
  detalle, aprobar/rechazar, lista básica de gimnasios. Nada más.
- D-GYM-ONB-6: `frontend-usuario` añade SOLO la pantalla "Registrar mi
  gimnasio" (formulario + estado pending/approved/rejected + acceso a Gym
  Web si está aprobado). Los flujos Cliente/Coach existentes no se tocan.
- D-GYM-ONB-7: privacidad — los endpoints de usuario nunca exponen
  `user_id`, identidad del revisor ni emails. Los endpoints de Admin sí
  incluyen `{id,name,email}` del solicitante (due diligence del revisor).
  Toda la superficie `/admin/*` está gateada por `is_platform_admin` con
  404 (no 403) — no es descubrible. Se mantiene Bearer Sanctum, anti-IDOR y
  el rate limiting `api` (120/min) existentes.

Lo que D-GYM-ONBOARDING NO autoriza:
billing/pagos/suscripciones, edición de gimnasios o sedes desde Admin,
suspender/eliminar gimnasios, gestión de `staff`, endpoint de
`grant-platform-admin`/`grant-gym-admin`, notificar al solicitante
(pull-only: consulta su propio estado), `frontend-gym` móvil, Organization,
`Gym` con lat/lng/dirección/estado (§5).

47. Roadmap conceptual aprobado
Fase 1 — Consolidación post-D1
CERRADA

Objetivo:

eliminar deriva;
alinear documentación;
registrar decisiones;
preservar legacy D fuera de alcance;
dejar un punto reproducible.
Fase 2 — MVP Producción
Objetivo:

Llevar el MVP actual a producción.

No implica desarrollar nuevas features de producto.

Prerequisitos principales:

host;
credenciales;
configuración;
despliegue;
validación de producción.
Fase 3 — Bloque Puntos
3a — D2 Racha
Definir/implementar:

current_streak
longest_streak

y su semántica definitiva.

3b — Duelos reales
Construir:

User ↔ Duel ↔ User

con reglas reales y conexión al ledger.

No mock.

3c — Flip de autoridad
Migrar progresivamente:

LocalStorage authority

hacia:

Backend ledger authority

incluyendo reconciliación offline y paridad necesaria.

Fase 4 — Ranking real
Solo después del bloque Puntos.

Requiere:

usuarios reales;
saldo autoritativo;
comunidad real;
opt-in persistido;
contexto Gym/branch;
city/country cuando corresponda;
reglas de privacidad.

### Gym surfaces and milestones

There are two Gym front-end surfaces (no monorepo; visual system shared by
hand):

- `frontend-gym/` — the Gym **mobile** application (React + Vite +
  **Capacitor**, `appId com.apysoft.gymprofit.gym`, bottom-tabs). Still only
  the UI Foundation (shell + login + placeholders). Its product is deferred
  to the full Coach/Gym phase (D-GYM-6).
- `frontend-gym-web/` — the Gym **web** application (React + Vite, **no
  Capacitor**, sidebar + main). Its UI Foundation was extended by the Gym MVP
  slice (D-GYM) with real member/coach administration and a member's shadow
  training snapshot.

(D-GYM-9: this replaces the earlier statement that `frontend-gym/` was "a web
application, not Capacitor/mobile" — that was wrong; the code, the root
`CLAUDE.md`, and `frontend-gym/CLAUDE.md` have always described it as the
mobile surface.)

Milestones:

1. Gym UI Foundation / technical bootstrap:
   - May be created before the Coach/Gym product phase.
   - Establishes the application shell and visual language only.
   - Must not introduce Gym business concepts, authorization rules, domain
     models, new endpoints, persistence, organization semantics, member/staff/
     coach workflows, or product behavior — EXCEPT the explicitly authorized
     Gym MVP slice (D-GYM), which is scoped and recorded in §46.

2. Gym Product Implementation (the rest):
   - Remains part of the approved Coach / Gym phase.
   - Introduces the full Gym domain, permissions, organization/branch
     semantics, administration workflows (`staff`, `gym_admin` provisioning,
     gym creation), backend contracts and product behavior beyond the D-GYM
     slice, plus the `frontend-gym` mobile product.

Creating the Gym UI Foundation does NOT constitute implementing or unlocking
the Coach/Gym product phase and must not be interpreted as authorization to
implement Gym business logic.

Fase 5 — Coach / Gym
Después del bloque Puntos.

Adelantos parciales YA implementados (ver §46 D-COACH y D-GYM, y
`PROJECT_STATE.md`):
- "Coach MVP slice" (D-COACH): lectura sombra del atleta + notas de feedback
  (gate = relación `active`).
- "Gym MVP slice" (D-GYM): `gym_admin` administra `member`/`coach` de su gym
  (alta por email + revocación) + lee el estado sombra de un miembro (gate =
  `GymAssignment(role=gym_admin, active)` en su gym). `gym_admin` está
  ACTIVO; `staff` sigue dormante.
Ninguno abre el resto de esta fase.

Incluye progresivamente (lo que queda):

acceso del coach/gym a programas/workouts/check-ins del atleta;
Program assignment;
`Organization` por encima de `Gym`; `Gym` con lat/lng/dirección/estado;
jerarquía multi-branch real;
`staff` operativo; concesión de `gym_admin`/`staff` por API;
creación de `Gym`/`Branch` por API;
lookup / búsqueda general de usuarios;
asignación del rol coach fuera de un gym;
permisos granulares;
`frontend-gym` (app móvil).
Fase 6 — Billing
Después de producción.

Requiere previamente:

decisión de monetización;
planes;
proveedor;
entitlements;
checkout;
webhooks;
modelo de customer/subscription. 48. Lo que NO debe hacerse por iniciativa propia
Hasta una decisión explícita, no:

implementar Ranking real;
implementar Duelos reales;
hacer flip de puntos;
migrar custom routines a Program/Workout (**sigue vigente** — la Fase 5 NO
  migró `customRoutines`: siguen en LocalStorage como fuente de verdad de las
  rutinas propias del atleta);
ampliar el acceso del Coach a los datos del atleta más allá de lo autorizado
  — hoy: slice D-COACH (Profile + actividad + racha + puntos, solo lectura) +
  **Fase 5** (el coach CREA/EDITA rutinas `Program` PARA el atleta con
  relación `active`, `created_by_user_id`; NO lee ni edita las rutinas
  propias del atleta ni sus workouts/check-ins crudos). Cualquier otro dato o
  escritura requiere una decisión nueva;
ampliar la superficie Gym más allá de lo autorizado — hoy: slice D-GYM +
  **Fase 5** (`gym_admin` gestiona el inventario `gym_equipment` de su gym y
  solicita máquinas nuevas al catálogo global vía `equipment_requests`; el
  catálogo global `equipment` solo lo escribe el BIAFYT Admin). Sigue sin
  autorizar: `staff`, concesión de `gym_admin`/`staff` por API, creación de
  `Gym`/`Branch`, `Organization`, `Gym` con lat/lng/estado, acceso del gym a
  programas/workouts del miembro, o `frontend-gym` móvil;
implementar Billing;
convertir mocks en backend por intuición;
convertir LocalStorage en API de autoridad;
crear endpoints porque "parecen necesarios";
crear migraciones para anticipar fases futuras;
tocar los legacy D de la raíz;
modificar archivos protegidos sin que la fase correspondiente lo autorice. 49. Regla de no reinterpretación
Las decisiones documentadas aquí deben considerarse decisiones de producto/arquitectura.

Un agente futuro no debe reinterpretarlas simplemente porque encuentre una implementación técnicamente más sencilla.

Si existe una contradicción:

identificarla;
no implementar;
reportarla;
solicitar una nueva decisión explícita. 50. Fuentes de verdad
En caso de duda:

Producto / negocio
BIAFYT_BUSINESS_CORE.md

Estado real del repositorio
PROJECT_STATE.md

Código
El código existente es evidencia del estado real, pero no reemplaza automáticamente las decisiones de negocio documentadas.

Instrucciones de trabajo
CLAUDE.md y .claude/

51. Regla final
    BIAFYT no debe convertirse en tres aplicaciones independientes que accidentalmente comparten una base de datos.

Debe evolucionar hacia:

                         BIAFYT
                             │
             ┌───────────────┼───────────────┐
             │               │               │
          CLIENTE          COACH            GYM
             │               │               │
             └───────────────┼───────────────┘
                             │
                             ▼
                    BACKEND / DOMAIN
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
       Training            Points            Community
          │                  │                  │
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                             ▼
                         Ecosystem

El Cliente/Usuario es el núcleo de adopción.

Coach agrega acompañamiento y programación.

Gym agrega contexto organizacional.

Points/Rewards/Challenges/Duels/Ranking construyen progresión y competencia.

Y las relaciones entre estos mundos deben ser explícitas, autorizadas y verificables, no simples conexiones de frontend.

52. Vouchers V1 + Promotion V0 — estado actual (sin Billing)
    Concepto de negocio completo (objetivo del producto; NO implementado en
su totalidad — ver marcas por línea):

- BIAFYT crea promociones de descuento sobre membresías Premium de
  Athlete, Coach y Gym. [IMPLEMENTADO como Promotion V1 — ver más abajo.
  Reemplaza la línea "Athlete (registro): Promotion V0; Gym y Coach:
  PENDIENTE DE DECISIÓN" que tenía esta sección — resuelto por decisión
  explícita del usuario. Billing/Plans/Google Play/Stripe/entitlements
  siguen sin existir — ver §43-44, sin cambios.]
- Un Gym puede emitir vouchers para incentivar la inscripción de Coaches y
  Athletes en su sede. [Gym→Athlete: IMPLEMENTADO; Gym→Coach: DIFERIDO]
- Un Coach puede emitir vouchers para incentivar la inscripción de Athletes
  con ese Coach. [IMPLEMENTADO]

IMPLEMENTADO (backend, sin commit todavía — detalle técnico completo en
`PROJECT_STATE.md` → `FASE: Vouchers V1`):
- Dominio `Voucher`: emisión, listado, redención y revocación, para
  Gym→Athlete y Coach→Athlete. 35 tests de voucher + suite backend completa
  (623/623) en verde.
- Deliberadamente aislado de puntos/rewards/promotions/billing: sin columna
  de moneda, sin cálculo de precio; BIAFYT nunca procesa dinero — la
  redención ocurre "off the platform", confirmada por el propio emisor
  (gym/coach). No define porcentajes, límites ni expiraciones por defecto:
  esos valores los carga libremente el emisor al crear el voucher, no son
  reglas de negocio de BIAFYT.

IMPLEMENTADO (backend + Admin UI, sin commit todavía — detalle técnico
completo en `PROJECT_STATE.md` → `FASE: Promotion V0` y `FASE: Promotion
V1`): Promotion V0 cubrió únicamente "BIAFYT → inscripción de Athlete"
en su forma más simple (registro); Promotion V1 lo reemplaza y extiende a
las tres audiencias:
- Dominio `Promotion` + `PromotionRule` + `PromotionRedemption`, separado
  de `Voucher` (sin tabla, controller ni código compartido). `Promotion` es
  un código reutilizable por muchos usuarios (a diferencia de `Voucher`, de
  un solo destinatario); no tiene beneficio ni audiencia propios. El
  beneficio y la audiencia viven en `PromotionRule` — una fila por
  `(audience, duration_months)` — así una misma promoción puede ofrecer
  descuentos distintos a Athlete/Coach/Gym y distintos por duración (3/6/12
  meses) dentro de la misma audiencia, y puede dirigirse a una, dos o las
  tres audiencias. Sin comodín "aplica a todos" en V1. Sin `plan_id`: la
  regla referencia audiencia+duración directamente, no existe todavía una
  entidad `Plan`.
- Creada por el BIAFYT Admin (`POST /admin/promotions`, gate
  `is_platform_admin`, mismo patrón que el resto de `Admin\*`), con sus
  reglas en la misma petición — sin edición/eliminación ni agregar reglas
  después de creada. `active`/`valid_from`/`valid_until` a nivel de la
  promoción completa (no por regla).
- `promo_code` se RETIRÓ del registro (`AuthController::register`): el
  modelo por regla ya no tiene un único beneficio que redimir en ese
  evento, al no haber audiencia ni duración resueltas ahí. La redención de
  una Promotion V1 queda diferida a un futuro flujo de compra —
  `PromotionRedemption` y su patrón de snapshot se conservan intactos para
  ese momento, pero hoy nada los crea.
- Mismo posicionamiento que `Voucher`: sin columna de moneda, sin cálculo
  de precio real; no define límites de uso (máximo de redenciones) todavía.
- Suite backend completa (646/646) + frontend-admin (14/14) en verde.

DIFERIDO (no diseñado, no implementado):
- Gym → Coach (un gym emitiendo un voucher hacia un coach, no hacia un
  athlete). No existe ni a nivel de schema.
- Promotion para captación vía Gym→Coach/Athlete o Coach→Athlete (lo que
  cubre `Voucher` hoy es post-inscripción, no captación — ver §52 arriba
  en la sección de Vouchers V1 y la nota de riesgo registrada en
  `PROJECT_STATE.md` → `FASE: Vouchers V1`).

PENDIENTE DE DECISIÓN (no diseñado, no implementado):
- Billing, Plans como entidad, Google Play, Stripe, pagos, checkout,
  entitlements, enforcement Free/Premium, límites de uso de una Promotion.
  Promotion V1 solo define QUÉ descuento aplicaría a una compra futura de
  Athlete/Coach/Gym Premium — no crea, valida ni cobra ninguna compra.
  Toca directamente §43–44 (Billing / Modelo comercial futuro): monetización,
  planes, proveedor, checkout, entitlements y modelo de subscription siguen
  sin decidirse. §43–44 NO cambian por esta fase — Billing sigue "fuera del
  roadmap cercano" y Promotion V1 no asume ni resuelve sus preguntas
  abiertas.
- Frontend de compra: cero integración en `frontend-usuario`,
  `frontend-couch`, `frontend-gym-web` ni `frontend-gym` (no existe ningún
  flujo de compra al que conectar una Promotion todavía). La creación de
  promociones sí tiene UI real en `frontend-admin`.

Nota de orden conceptual (posible contradicción a resolver, NO resuelta
aquí): §45 ubica "Ecosistema" DESPUÉS de Comunidad/Ranking y de Coach/Gym en
el orden de dependencia conceptual del producto. Vouchers V1 (etapa
"Ecosistema") se implementó sin que Ranking real (Fase 4) ni el flip de
autoridad de puntos (roadmap 3c) estén cerrados — ver `PROJECT_STATE.md` →
`## SIGUIENTE FASE`. Esto no se resuelve en este documento; se deja
registrado para que una decisión futura confirme si el orden de §45 sigue
vigente tal cual o si Vouchers V1 es una excepción aceptada.

Importante: ni Vouchers V1 ni Promotion V1 deben presentarse o
interpretarse, juntos o por separado, como el sistema completo de
promociones de BIAFYT. Vouchers V1 es únicamente la mitad "ecosistema"
(Gym/Coach → Athlete, post-inscripción); Promotion V1 es únicamente la
mitad "plataforma" (descuentos BIAFYT sobre membresías Premium de
Athlete/Coach/Gym) — sin Billing/Plans/Google Play detrás, no procesa ni
valida ninguna compra real todavía. Gym→Coach y cualquier voucher de captación
(pre-inscripción) siguen sin existir.

Estado del documento
Tipo: Business Core / Product & Domain Truth
Estado: Aprobado como fuente de verdad conceptual
Implementación: Parcial; las decisiones marcadas "NO IMPLEMENTADO" no deben inferirse como código existente.
Documento técnico complementario: PROJECT_STATE.md
Documento de instrucciones: CLAUDE.md / .claude/
Última consolidación conocida: post-D1 + slice Coach MVP (D-COACH) + slice Gym MVP (D-GYM)

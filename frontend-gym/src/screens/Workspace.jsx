import { Screen, Card, Badge, EmptyState } from "../components/UI.jsx";

/**
 * ESPACIO — PLACEHOLDER
 *
 * Pantalla puramente visual. No implementa gestión de sedes, miembros,
 * staff, coaches, programas ni ninguna otra capacidad Gym. Diferido a la
 * fase Coach/Gym — ver BIAFYT_BUSINESS_CORE.md §46 (D8), §47 (Fase 5).
 */
export default function Workspace() {
  return (
    <Screen title="Espacio" subtitle="Superficie Gym — foundation">
      <Card className="placeholder-note">
        Andamiaje visual. La gestión operativa del gimnasio (sedes, miembros,
        staff, coaches, programas) requiere el dominio Gym y su autorización
        organizacional, ambos diferidos a la fase Coach/Gym.
      </Card>

      <div className="stack-sm">
        {["Sedes", "Miembros", "Staff y coaches"].map((label) => (
          <Card key={label}>
            <div className="row-between">
              <strong>{label}</strong>
              <Badge tone="warning">Pronto</Badge>
            </div>
          </Card>
        ))}
      </div>

      <EmptyState icon="▦" title="Nada que gestionar todavía" text="Estas secciones se activan en la fase Coach/Gym." />
    </Screen>
  );
}

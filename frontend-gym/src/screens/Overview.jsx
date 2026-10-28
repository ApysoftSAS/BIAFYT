import { Screen, Card, Badge, EmptyState } from "../components/UI.jsx";

/**
 * RESUMEN — PLACEHOLDER
 *
 * Pantalla puramente visual. NO muestra datos reales ni implementa
 * ninguna capacidad del dominio Gym. El contenido real de esta superficie
 * (métricas de la organización, actividad de sedes, etc.) se define en la
 * fase Coach/Gym del roadmap — ver BIAFYT_BUSINESS_CORE.md §5, §46 (D8),
 * §47 (Fase 5).
 */
export default function Overview() {
  return (
    <Screen title="Resumen" subtitle="Superficie Gym — foundation">
      <Card className="placeholder-note">
        Andamiaje visual. La superficie Gym (organización, sedes, miembros, staff,
        coaches, administración) se implementa en la fase Coach/Gym del roadmap.
        Esta pantalla no tiene datos ni funcionalidad.
      </Card>

      <Card>
        <div className="row-between">
          <div>
            <p className="micro">Sección</p>
            <h3>Resumen de la organización</h3>
            <p className="muted">Disponible en la fase Coach/Gym.</p>
          </div>
          <Badge tone="warning">Pronto</Badge>
        </div>
      </Card>

      <EmptyState
        icon="▤"
        title="Sin contenido todavía"
        text="Cuando exista el dominio Gym, aquí verás el estado de tu organización."
      />
    </Screen>
  );
}

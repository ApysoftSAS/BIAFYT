import { useMemo, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Badge, Button, Card, Screen, Tabs } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";
import { postsFor, POST_TYPES } from "../data/community.js";

const FORMATTER = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "long" });

/**
 * NOTICIAS Y PROMOCIONES
 * Contenido publicado por el administrador del gimnasio. En la demo
 * llega desde data/community.js; en producción vendría del panel B2B
 * filtrado por gimnasio y sede.
 */
export default function News({ onBack }) {
  const { state, gym, actions } = useApp();
  const [filter, setFilter] = useState("todo");
  const [open, setOpen] = useState(null);

  const posts = useMemo(() => postsFor(state.identity.user.gymId), [state.identity.user.gymId]);
  const visible = useMemo(() => (filter === "todo" ? posts : posts.filter((p) => p.type === filter)), [posts, filter]);

  // ---------------- DETALLE ----------------
  if (open) {
    const type = POST_TYPES[open.type];
    return (
      <Screen title={type.label.toUpperCase()} onBack={() => setOpen(null)}>
        <div className="stack">
          <Card>
            <Badge tone={type.tone}>{type.label}</Badge>
            <h2 className="post-title">{open.title}</h2>
            <p className="micro">
              {gym?.name ?? "Tu gimnasio"} · {FORMATTER.format(new Date(open.publishedAt))}
            </p>
            <p>{open.body}</p>
            {open.cta && <p className="text-warning">{open.cta}</p>}
          </Card>
          <Button variant="ghost" full onClick={() => setOpen(null)}>
            VOLVER
          </Button>
        </div>
        <Coach state="explicacion" message="Publicado por tu gimnasio." />
      </Screen>
    );
  }

  // ---------------- LISTA ----------------
  return (
    <Screen title="NOVEDADES" subtitle={gym?.name ?? "Sin gimnasio asociado"} onBack={onBack}>
      <Tabs
        items={[
          { id: "todo", label: "Todo" },
          { id: "promocion", label: "Promociones" },
          { id: "noticia", label: "Noticias" },
          { id: "evento", label: "Eventos" },
        ]}
        value={filter}
        onChange={setFilter}
      />

      <div className="stack-sm">
        {visible.map((p) => {
          const type = POST_TYPES[p.type];
          const unread = !state.identity.readPosts.includes(p.id);
          return (
            <Card
              key={p.id}
              className={p.pinned ? "card-selected" : ""}
              onClick={() => {
                actions.markPostRead(p.id);
                setOpen(p);
              }}
            >
              <div className="row-between">
                <div className="row-left">
                  <Badge tone={type.tone}>{type.label}</Badge>
                  {p.pinned && <span className="micro">📌 Destacado</span>}
                </div>
                {unread && <span className="unread-dot" />}
              </div>
              <strong className="post-title">{p.title}</strong>
              <p className="muted">{p.summary}</p>
              <p className="micro">{FORMATTER.format(new Date(p.publishedAt))}</p>
            </Card>
          );
        })}
        {visible.length === 0 && <p className="muted center">No hay publicaciones en esta categoría.</p>}
      </div>

      <Coach state="explicacion" message="Tu gimnasio publica aquí sus novedades." />
    </Screen>
  );
}

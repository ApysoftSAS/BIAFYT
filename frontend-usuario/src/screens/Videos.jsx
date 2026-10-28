import { useMemo, useState } from "react";
import { videos } from "../data/videos.js";
import { coaches, findCoach } from "../data/coaches.js";
import { Avatar, Card, Field, Input, Tabs } from "../components/UI.jsx";

// Filtro "Coach": viene de la relación real BIAFYT Coach → cuenta de
// TikTok (sabemos de qué cuenta vino cada video). No es una categoría
// que TikTok provea.
export default function Videos({ onBack }) {
  const [coachId, setCoachId] = useState("all");
  const [query, setQuery] = useState("");

  const coachTabs = useMemo(() => {
    const withVideos = coaches.filter((c) => videos.some((v) => v.coachId === c.id));
    return [{ id: "all", label: "Todos" }, ...withVideos.map((c) => ({ id: c.id, label: c.name.split(" ")[0] }))];
  }, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return videos.filter((v) => {
      if (coachId !== "all" && v.coachId !== coachId) return false;
      if (!q) return true;
      // Búsqueda sobre campos reales de TikTok (title / video_description).
      return `${v.tiktok.title} ${v.tiktok.video_description}`.toLowerCase().includes(q);
    });
  }, [coachId, query]);

  return (
    <div className="screen">
      <header className="screen-head">
        {onBack && (
          <button className="icon-btn" onClick={onBack} aria-label="Volver">
            ←
          </button>
        )}
        <div className="screen-title">
          <h1>VIDEOS</h1>
          <p>Rutinas y consejos de los coaches en TikTok.</p>
        </div>
      </header>
      <div className="screen-body">
        <Field label="Buscar video">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rutina, pecho, movilidad…" />
        </Field>
        <Tabs items={coachTabs} value={coachId} onChange={setCoachId} />
        <div className="stack">
          {list.map((v) => (
            <VideoCard key={v.id} video={v} coach={findCoach(v.coachId)} />
          ))}
          {list.length === 0 && <p className="muted center">Sin videos.</p>}
        </div>
      </div>
    </div>
  );
}

// Reutiliza la Card existente de BIAFYT (misma superficie/borde/sombra/
// radio que el resto de la app) — solo se complementa con el contenido
// del video. La reproducción real (TikTok Embed Player) se conecta aquí
// más adelante mediante utils/tiktok.js; el video nunca se descarga.
function VideoCard({ video, coach }) {
  const { tiktok } = video;
  return (
    <Card>
      <div className="video-frame" aria-hidden="true">
        ▶
      </div>
      <div className="rank-row-sm">
        <Avatar initials={coach?.initials ?? "?"} name={coach?.name} size={32} />
        <div>
          <strong>{coach?.name ?? "Coach"}</strong>
          <p className="micro">Coach</p>
        </div>
      </div>
      <strong>{tiktok.title}</strong>
      <p className="muted">{tiktok.video_description}</p>
    </Card>
  );
}

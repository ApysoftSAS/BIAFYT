import { useEffect, useMemo, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { apiErrorMessage, apiGetCoachVideos } from "../utils/api.js";
import { initialsOf } from "../utils/format.js";
import { tiktokPlayerUrl } from "../utils/tiktok.js";
import { Avatar, Card, Field, Input, Tabs } from "../components/UI.jsx";

// Vitrina de coaches: videos de TikTok que cada coach publicó desde su
// app (GET /coach-videos). Los ve cualquier usuario de BIAFYT. El video
// nunca se descarga: se reproduce con el Embed Player oficial de TikTok.
export default function Videos({ onBack }) {
  const { state } = useApp();
  const token = state.auth.token;
  const [videos, setVideos] = useState(null); // null = cargando
  const [error, setError] = useState("");
  const [coachId, setCoachId] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!token) return;
    let alive = true;
    apiGetCoachVideos(token)
      .then((data) => alive && setVideos(data.videos))
      .catch((e) => {
        if (!alive) return;
        setVideos([]);
        setError(apiErrorMessage(e, "No pudimos cargar los videos."));
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const coachTabs = useMemo(() => {
    const byId = new Map((videos ?? []).map((v) => [v.coach.id, v.coach.name]));
    return [{ id: "all", label: "Todos" }, ...[...byId].map(([id, name]) => ({ id, label: name.split(" ")[0] }))];
  }, [videos]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (videos ?? []).filter(
      (v) => (coachId === "all" || v.coach.id === coachId) && (!q || `${v.title} ${v.coach.name}`.toLowerCase().includes(q))
    );
  }, [videos, coachId, query]);

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
        <Field label="Buscar video o coach">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rutina, pecho, movilidad…" />
        </Field>
        {coachTabs.length > 2 && <Tabs items={coachTabs} value={coachId} onChange={setCoachId} />}
        <div className="stack">
          {videos === null && <p className="muted center">Cargando…</p>}
          {error && <p className="muted center text-warning">{error}</p>}
          {list.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
          {videos !== null && !error && list.length === 0 && (
            <p className="muted center">{videos.length === 0 ? "Aún no hay videos de coaches." : "Sin videos."}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// El iframe del reproductor solo se monta al tocar ▶ (uno por tarjeta):
// evita cargar N reproductores de TikTok al abrir la pantalla.
function VideoCard({ video }) {
  const [playing, setPlaying] = useState(false);
  const { coach } = video;
  return (
    <Card>
      {playing ? (
        <div className="video-frame">
          <iframe
            src={tiktokPlayerUrl(video.tiktok_video_id)}
            title={video.title}
            allow="fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <button className="video-frame" onClick={() => setPlaying(true)} aria-label={`Reproducir: ${video.title}`}>
          ▶
        </button>
      )}
      <div className="rank-row-sm">
        <Avatar initials={initialsOf(coach.name)} name={coach.name} size={32} />
        <div>
          <strong>{coach.name}</strong>
          <p className="micro">
            Coach ·{" "}
            <a href={`https://www.tiktok.com/@${video.tiktok_username}`} target="_blank" rel="noreferrer">
              @{video.tiktok_username}
            </a>
          </p>
        </div>
      </div>
      <strong>{video.title}</strong>
    </Card>
  );
}

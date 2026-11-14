import { useEffect, useState } from "react";
import { useCoach } from "../state/CoachContext.jsx";
import { Avatar, Button, Card, Field, Input, Screen } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";
import appConfig from "../config/appConfig.js";

export default function Profile() {
  const { auth, actions } = useCoach();

  return (
    <Screen title="PERFIL">
      <div className="stack">
        <Card>
          <div className="row-gap">
            <Avatar name={auth.user.name} initials={auth.user.initials} size={56} />
            <div>
              <h3>{auth.user.name}</h3>
              <p className="muted">{auth.user.email}</p>
            </div>
          </div>
        </Card>

        <VideoShowcase />

        <Card>
          <p className="micro">CUENTA</p>
          <Button variant="ghost" full onClick={actions.signOut}>
            CERRAR SESIÓN
          </Button>
        </Card>

        <Card className="soft">
          <p className="micro">
            {appConfig.name} · versión {appConfig.version} · {appConfig.id}
          </p>
        </Card>
      </div>
    </Screen>
  );
}

// Vitrina del coach: enlaces a sus videos de TikTok que ven TODOS los
// usuarios de BIAFYT. El video nunca se sube ni se descarga; el backend
// solo guarda el usuario y el id que vienen en el enlace.
function VideoShowcase() {
  const { actions } = useCoach();
  const { getMyVideos, createVideo, deleteVideo } = actions;
  const [videos, setVideos] = useState(null); // null = cargando
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [reload, setReload] = useState(0); // se incrementa tras publicar/quitar

  useEffect(() => {
    let alive = true;
    getMyVideos()
      .then((data) => alive && setVideos(data.videos))
      .catch((e) => {
        if (!alive) return;
        setVideos([]);
        setError(apiErrorMessage(e, "No pudimos cargar tus videos."));
      });
    return () => {
      alive = false;
    };
  }, [getMyVideos, reload]);

  async function run(fn, fallback) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setReload((n) => n + 1);
    } catch (e) {
      setError(apiErrorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    run(async () => {
      await createVideo({ url: url.trim(), title: title.trim() });
      setUrl("");
      setTitle("");
    }, "No se pudo publicar el video.");
  }

  return (
    <Card>
      <p className="micro">MIS VIDEOS DE TIKTOK</p>
      <p className="muted">
        Tu vitrina: todos los usuarios de {appConfig.name} ven estos videos. Pega el enlace completo de cada video.
      </p>

      <form className="stack" onSubmit={submit}>
        <Field label="Enlace del video" hint="https://www.tiktok.com/@tuusuario/video/123…">
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@…" required />
        </Field>
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rutina de pecho" maxLength={150} required />
        </Field>
        {error && (
          <p className="muted text-warning" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" full disabled={busy}>
          {busy ? "GUARDANDO…" : "PUBLICAR VIDEO"}
        </Button>
      </form>

      {videos === null && <p className="muted">Cargando…</p>}
      {videos?.length === 0 && <p className="muted">Aún no has publicado videos.</p>}
      {videos?.map((v) => (
        <div className="row-between" key={v.id}>
          <div>
            <strong>{v.title}</strong>
            <p className="micro">@{v.tiktok_username}</p>
          </div>
          <Button variant="ghost" disabled={busy} onClick={() => run(() => deleteVideo(v.id), "No se pudo quitar el video.")}>
            QUITAR
          </Button>
        </div>
      ))}
    </Card>
  );
}

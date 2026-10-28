import { useEffect, useRef, useState } from "react";
import { Button } from "./UI.jsx";
import { parseAthleteQr } from "../utils/coachQr.js";

/**
 * Escáner del QR "Conéctate con un coach" del atleta.
 *
 * SOLO extrae el `athlete_user_id` del QR y lo pasa por `onDetected`. NO
 * llama al backend, NO autoriza ni acepta nada: la solicitud (con el
 * consentimiento del atleta) la dispara el llamador con el flujo existente
 * (`POST /me/coach-relationships`).
 *
 * `qr-scanner` se importa de forma diferida (dynamic import): toca cámara /
 * Web Worker / BarcodeDetector, ninguno disponible en jsdom. Fuera del
 * navegador el componente muestra el error y el llamador conserva la
 * entrada manual del ID como alternativa.
 */
export default function ScanQr({ onDetected, onCancel }) {
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const doneRef = useRef(false);
  const [status, setStatus] = useState("loading"); // loading | scanning | error
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const finish = (text) => {
      if (doneRef.current) return;
      const parsed = parseAthleteQr(text);
      if (!parsed) {
        setError("Ese QR no es de un atleta BIAFYT. Usa el ID manual si el problema persiste.");
        return;
      }
      doneRef.current = true;
      try {
        scannerRef.current?.stop();
      } catch {
        /* noop */
      }
      onDetected(parsed.athleteId);
    };

    (async () => {
      let QrScanner;
      try {
        QrScanner = (await import("qr-scanner")).default;
      } catch {
        if (!cancelled) {
          setStatus("error");
          setError("No se pudo cargar el escáner.");
        }
        return;
      }
      if (cancelled || !videoRef.current) return;

      try {
        if (!(await QrScanner.hasCamera())) {
          setStatus("error");
          setError("No se detectó ninguna cámara. Usa 'Escanear desde imagen' o el ID manual.");
          return;
        }
        const scanner = new QrScanner(
          videoRef.current,
          (result) => finish(typeof result === "string" ? result : result?.data),
          { preferredCamera: "environment", highlightScanRegion: true, maxScansPerSecond: 5 }
        );
        scannerRef.current = scanner;
        await scanner.start();
        if (!cancelled) setStatus("scanning");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(
          e?.name === "NotAllowedError"
            ? "Permiso de cámara denegado. Actívalo en el navegador, o usa 'Escanear desde imagen' / el ID manual."
            : "No se pudo abrir la cámara (requiere HTTPS y permiso). Usa 'Escanear desde imagen' o el ID manual."
        );
      }
    })();

    return () => {
      cancelled = true;
      try {
        scannerRef.current?.stop();
        scannerRef.current?.destroy?.();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scanFromImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      const QrScanner = (await import("qr-scanner")).default;
      const res = await QrScanner.scanImage(file, { returnDetailedScanResult: true }).catch(() =>
        QrScanner.scanImage(file)
      );
      if (doneRef.current) return;
      const parsed = parseAthleteQr(typeof res === "string" ? res : res?.data);
      if (!parsed) {
        setError("No se encontró un QR de atleta BIAFYT en esa imagen.");
        return;
      }
      doneRef.current = true;
      onDetected(parsed.athleteId);
    } catch {
      setError("No se pudo leer un QR en esa imagen.");
    }
  };

  return (
    <div className="stack">
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
          background: "#000",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>

      {status === "loading" && !error && <p className="muted">Abriendo cámara…</p>}
      {status === "scanning" && !error && (
        <p className="muted">Apunta a la sección "Conéctate con un coach" de la app del atleta.</p>
      )}
      {error && <p className="text-warning">{error}</p>}

      <label
        className="btn btn-ghost btn-full"
        style={{ display: "flex", justifyContent: "center", cursor: "pointer" }}
      >
        ESCANEAR DESDE IMAGEN
        <input type="file" accept="image/*" onChange={scanFromImage} hidden />
      </label>
      <Button variant="ghost" full onClick={onCancel}>
        CANCELAR
      </Button>
    </div>
  );
}

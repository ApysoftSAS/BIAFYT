import davidImg from "../assets/david.png";

// Fondo global fijo: se monta una sola vez en el shell raíz (App.jsx) y
// queda detrás de todas las pantallas, inmóvil frente al scroll de cada una.
export default function AppBackground() {
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="app-bg-figure">
        <img src={davidImg} alt="" />
        <div className="app-bg-tint" />
        <div className="app-bg-fade" />
      </div>
    </div>
  );
}

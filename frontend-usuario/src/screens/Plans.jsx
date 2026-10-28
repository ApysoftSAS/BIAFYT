import { useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { plans } from "../data/plans.js";
import { Badge, Button, Card, Field, Input, Screen } from "../components/UI.jsx";
import { formatPrice, formatDate } from "../utils/format.js";
import { validateDiscountCode, calculateFinalPrice, discountErrorMessage } from "../utils/discounts.js";

export default function Plans({ onBack }) {
  const { state, actions } = useApp();

  return (
    <Screen title="PLANES" subtitle="Elige el plan que se ajuste a tu entrenamiento." onBack={onBack}>
      <div className="stack-sm">
        {plans.map((p) => {
          const isCurrent = state.identity.user.plan?.id === p.id && state.identity.user.plan?.status === "active";
          return (
            <PlanCard
              key={p.id}
              plan={p}
              isCurrent={isCurrent}
              expiresAt={isCurrent ? state.identity.user.plan?.expiresAt : null}
              discountUsage={state.identity.discountUsage}
              actions={actions}
            />
          );
        })}
      </div>
    </Screen>
  );
}

function PlanCard({ plan, isCurrent, expiresAt, discountUsage, actions }) {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState(null); // { code, type, value, ... } del catálogo, o null
  const [error, setError] = useState("");

  const checkCode = () => {
    setError("");
    setApplied(null);
    if (!code.trim()) return;
    const result = validateDiscountCode(code, plan.id, discountUsage);
    if (!result.valid) {
      setError(discountErrorMessage(result.reason));
      return;
    }
    setApplied(result.discount);
  };

  const pricing = calculateFinalPrice(plan.price, applied);

  const confirm = () => {
    const result = actions.selectPlan(plan.id, applied ? applied.code : undefined);
    if (result.ok) {
      actions.notify({
        channel: "promos",
        title: "Plan actualizado",
        body: applied
          ? `Ahora tienes ${plan.name} por ${formatPrice(result.finalPrice)}.`
          : `Ahora tienes ${plan.name}.`,
        tone: "success",
      });
      setCode("");
      setApplied(null);
      setError("");
    } else if (result.reason) {
      setApplied(null);
      setError(discountErrorMessage(result.reason));
    }
  };

  return (
    <Card className={isCurrent ? "card-selected" : ""}>
      <div className="row-between">
        <div>
          <p className="micro">{plan.periodicity.toUpperCase()}</p>
          <h3>{plan.name}</h3>
          <p className="muted">{plan.description}</p>
        </div>
        {isCurrent && <Badge tone="accent">Tu plan</Badge>}
      </div>

      {applied ? (
        <div className="stack-sm">
          <p className="muted" style={{ textDecoration: "line-through" }}>
            {formatPrice(pricing.originalPrice)}
          </p>
          <p className="text-success">Descuento: -{formatPrice(pricing.discountAmount)}</p>
          <p className="big-number">{formatPrice(pricing.finalPrice)}</p>
        </div>
      ) : (
        <p className="big-number">{plan.price === 0 ? "GRATIS" : formatPrice(plan.price)}</p>
      )}

      <ul className="list">
        {plan.benefits.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      {isCurrent && expiresAt && <p className="micro">Vence: {formatDate(expiresAt)}</p>}

      {!isCurrent && plan.active && plan.price > 0 && (
        <Field label="Código de descuento">
          <div className="discount-row">
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setApplied(null);
                setError("");
              }}
              placeholder="Ej: SOMA20"
              autoCapitalize="characters"
            />
            <Button variant="ghost" onClick={checkCode} disabled={!code.trim()}>
              VALIDAR
            </Button>
          </div>
        </Field>
      )}
      {applied && <Badge tone="success">Código {applied.code} aplicado</Badge>}
      {error && <p className="text-error micro">{error}</p>}

      <Button
        full
        variant={isCurrent ? "ghost" : "primary"}
        disabled={isCurrent || !plan.active}
        onClick={confirm}
      >
        {isCurrent ? "PLAN ACTUAL" : !plan.active ? "NO DISPONIBLE" : "SELECCIONAR"}
      </Button>
    </Card>
  );
}

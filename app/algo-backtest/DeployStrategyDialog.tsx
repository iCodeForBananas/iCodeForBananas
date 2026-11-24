"use client";

// "Deploy strategy": publishes the selected backtest result to the Tradier
// paper-trading dispatcher. Every field starts at the value the run used
// (deployConfig.ts); anything the run can't tell us is blank and has to be
// filled in. Deploying is a row in public.strategy_deployments, which the
// dispatcher Lambda picks up on its next 5-minute tick: no CDK deploy.

import { useState } from "react";
import Link from "next/link";
import { Callout, Dialog, Switch, Text, TextField } from "@radix-ui/themes";
import { Check, Rocket, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import type { StrategyDefinition } from "@/app/strategies/types";
import { NUMBER_FIELDS, type DeployDraft, type NumberField } from "./deployConfig";

const LABELS: Record<NumberField, { label: string; hint: string }> = {
  startingEquity: { label: "Starting equity ($)", hint: "Its own paper account: sizing and limits use this plus its own P&L." },
  positionSizePct: { label: "Position size (% of equity)", hint: "Put into each entry." },
  maxDailyLossPct: { label: "Daily loss limit (%)", hint: "100 is off." },
  drawdownLimitPct: { label: "Drawdown limit (%)", hint: "Closes the position and pauses entries when hit; 100 is off." },
  drawdownPauseBars: { label: "Drawdown pause (bars)", hint: "Bars without entries after the drawdown limit trips." },
  minBars: { label: "Warm-up bars", hint: "Completed bars needed before the first signal." },
  historyDays: { label: "History (calendar days)", hint: "Fetched on every run; at most 40 for intraday bars." },
};

export interface BacktestSummary {
  label: string;
  totalPnlPercent: number;
  totalTrades: number;
  winRate: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
}

interface Props {
  strategy: StrategyDefinition;
  draft: DeployDraft;
  backtest: BacktestSummary;
  onClose: () => void;
}

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string; details?: string[] } | { kind: "done"; id: string };

export default function DeployStrategyDialog({ strategy, draft, backtest, onClose }: Props) {
  const [values, setValues] = useState<Record<NumberField, string>>(() =>
    Object.fromEntries(NUMBER_FIELDS.map((k) => [k, draft.numbers[k] === null ? "" : String(draft.numbers[k])])) as Record<NumberField, string>,
  );
  const [enableShorts, setEnableShorts] = useState(draft.enableShorts);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const blank = NUMBER_FIELDS.filter((k) => values[k].trim() === "" || !Number.isFinite(Number(values[k])));
  const canDeploy = draft.blockers.length === 0 && blank.length === 0 && status.kind !== "saving" && status.kind !== "done";

  async function deploy() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/strategy-deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deployment: {
            strategyId: draft.strategyId,
            symbol: draft.symbol,
            interval: draft.interval,
            params: draft.params,
            enableShorts,
            ...Object.fromEntries(NUMBER_FIELDS.map((k) => [k, Number(values[k])])),
          },
          backtest,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: "error", message: json.error ?? `Deploy failed (${res.status})`, details: json.details });
        return;
      }
      setStatus({ kind: "done", id: json.deployment.id });
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content maxWidth="560px">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Dialog.Title size="5" mb="1">
              Deploy {strategy.name}
            </Dialog.Title>
            <Dialog.Description size="2" className="text-ink-muted">
              {draft.symbol ?? "Unknown symbol"} · {draft.interval ?? "unknown interval"} · paper trading on Tradier, checked every 5 minutes through the trading day.
            </Dialog.Description>
          </div>
          <Dialog.Close>
            <Button variant="ghost" size="icon" aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </Dialog.Close>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {draft.blockers.length > 0 && (
            <Callout.Root color="red" size="1">
              <Callout.Text>
                This result can&apos;t be deployed from here:
                {draft.blockers.map((b) => (
                  <span key={b} className="block">
                    {b}
                  </span>
                ))}
              </Callout.Text>
            </Callout.Root>
          )}

          <section>
            <Text as="p" size="2" weight="bold" mb="1">
              Parameters
            </Text>
            <Text as="p" size="2" className="font-mono text-ink-muted">
              {Object.entries(draft.params)
                .map(([k, v]) => `${k} ${String(v)}`)
                .join(" · ") || "none"}
            </Text>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {NUMBER_FIELDS.map((k) => (
              <label key={k} className="flex flex-col gap-1">
                <Text size="2" weight="medium">
                  {LABELS[k].label}
                </Text>
                <TextField.Root
                  type="number"
                  inputMode="decimal"
                  value={values[k]}
                  color={blank.includes(k) ? "red" : undefined}
                  placeholder={draft.unknown[k] ? "Needs a value" : undefined}
                  onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                  disabled={status.kind === "done"}
                />
                <Text size="1" className="text-ink-muted">
                  {draft.unknown[k] && draft.numbers[k] === null ? `Unknown: ${draft.unknown[k]}.` : LABELS[k].hint}
                </Text>
              </label>
            ))}
            <label className="flex items-center gap-2 sm:col-span-2">
              <Switch size="1" checked={enableShorts} onCheckedChange={setEnableShorts} disabled={status.kind === "done"} />
              <Text size="2">Trade short as well as long{enableShorts === draft.enableShorts ? " (as the backtest did)" : ""}</Text>
            </label>
          </section>

          {draft.lacks.length > 0 && (
            <Callout.Root color="amber" size="1">
              <Callout.Text>
                The backtest used these, which live trading doesn&apos;t have: {draft.lacks.join("; ")}. Expect the live results to differ.
              </Callout.Text>
            </Callout.Root>
          )}

          {status.kind === "error" && (
            <Callout.Root color="red" size="1" role="alert">
              <Callout.Text>
                {status.message}
                {status.details?.map((d) => (
                  <span key={d} className="block">
                    {d}
                  </span>
                ))}
              </Callout.Text>
            </Callout.Root>
          )}
          {status.kind === "done" && (
            <Callout.Root color="green" size="1" role="status">
              <Callout.Text>
                Deployed as <code>{status.id}</code>. It trades from the next bar after the dispatcher&apos;s next tick.{" "}
                <Link href="/strategy-deployments" className="underline">
                  Manage deployed strategies
                </Link>
              </Callout.Text>
            </Callout.Root>
          )}

          <div className="flex justify-end gap-2">
            <Dialog.Close>
              <Button variant="secondary">{status.kind === "done" ? "Close" : "Cancel"}</Button>
            </Dialog.Close>
            {status.kind !== "done" && (
              <Button variant="primary" onClick={deploy} disabled={!canDeploy}>
                {status.kind === "saving" ? <Check className="size-4" /> : <Rocket className="size-4" />}
                {status.kind === "saving" ? "Deploying…" : "Deploy strategy"}
              </Button>
            )}
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

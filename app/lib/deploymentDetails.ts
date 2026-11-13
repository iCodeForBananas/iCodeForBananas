// What a live trading deployment does, for /trading-leaderboard: its
// strategy's description and the exact parameter values it trades with.
//
// The Lambdas report only the deployment id, but that id is built from the
// settings (deploymentId in trading/runtime/config.ts):
// strategy-symbol-interval-<param values in the strategy's order>-<ls|l>,
// booleans as y/n, "." as p and "-" as m. This reads it back. An id that
// doesn't parse (a hand-set id, a strategy renamed since) shows the
// description alone rather than guessing at values.

import { AVAILABLE_STRATEGIES } from "@/app/strategies";
import type { StrategyParameter } from "@/app/strategies/types";

export interface DeploymentParam {
  name: string;
  value: string;
}

export type ParamValue = string | number | boolean;

export interface DeploymentDetails {
  description: string | null;
  sides: "Long and short" | "Long only" | null;
  params: DeploymentParam[];
  /** The same values keyed by parameter key, as the strategy takes them; {} when the id doesn't parse. */
  values: Record<string, ParamValue>;
}

export interface DeploymentIdentity {
  id: string;
  strategyId: string;
  symbol: string;
  /** As reported, e.g. "15min", "1h", "1d". */
  interval: string;
}

const slug = (v: string) => v.toLowerCase().replace(/-/g, "m").replace(/\./g, "p").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** A parameter's value from its id token, formatted for reading, or null if it doesn't fit. */
function readValue(token: string, p: StrategyParameter): string | null {
  const percent = / \(%\)$/.test(p.name);
  if (p.type === "boolean") return token === "y" ? "On" : token === "n" ? "Off" : null;
  if (p.type === "select") return (p.options ?? []).find((o) => slug(o) === token) ?? null;
  if (!/^m?\d+(p\d+)?$/.test(token)) return null;
  const n = Number(token.replace(/^m/, "-").replace("p", "."));
  return `${n}${percent ? "%" : ""}`;
}

/** The value a strategy handler takes for an id token readValue accepted. */
function rawValue(token: string, p: StrategyParameter): ParamValue {
  if (p.type === "boolean") return token === "y";
  if (p.type === "select") return (p.options ?? []).find((o) => slug(o) === token)!;
  return Number(token.replace(/^m/, "-").replace("p", "."));
}

export function deploymentDetails(d: DeploymentIdentity): DeploymentDetails {
  const strategy = AVAILABLE_STRATEGIES[d.strategyId];
  const description = strategy?.description ?? null;
  const none: DeploymentDetails = { description, sides: null, params: [], values: {} };
  if (!strategy) return none;

  const prefix = [d.strategyId, d.symbol.toLowerCase().replace(/\./g, "p"), d.interval.replace("min", "m")].join("-") + "-";
  if (!d.id.startsWith(prefix)) return none;
  const tokens = d.id.slice(prefix.length).split("-");
  const side = tokens.pop();
  const sides = side === "ls" ? "Long and short" : side === "l" ? "Long only" : null;
  const parameters = strategy.parameters ?? [];
  if (!sides || tokens.length !== parameters.length) return none;

  const params: DeploymentParam[] = [];
  const values: Record<string, ParamValue> = {};
  for (let i = 0; i < parameters.length; i++) {
    const value = readValue(tokens[i], parameters[i]);
    if (value === null) return none;
    params.push({ name: parameters[i].name.replace(/ \(%\)$/, ""), value });
    values[parameters[i].key] = rawValue(tokens[i], parameters[i]);
  }
  return { description, sides, params, values };
}

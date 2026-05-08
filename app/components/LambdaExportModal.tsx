"use client";

import React, { useState } from "react";

interface LambdaExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  strategyId: string;
  strategyName: string;
  params: Record<string, number | boolean | string>;
}

export default function LambdaExportModal({
  isOpen, onClose, strategyId, strategyName, params,
}: LambdaExportModalProps) {
  const [symbol, setSymbol] = useState("SPY");
  const [positionSize, setPositionSize] = useState(100);
  const [initialCapital, setInitialCapital] = useState(10000);
  const [lambdaName, setLambdaName] = useState(`${strategyName} on SPY`);
  const [tradierApiKey, setTradierApiKey] = useState("");
  const [tradierAccountId, setTradierAccountId] = useState("");
  const [isSandbox, setIsSandbox] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deployed, setDeployed] = useState<{ id: string; name: string } | null>(null);

  if (!isOpen) return null;

  const handleDeploy = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const resp = await fetch("/api/trading/lambdas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: lambdaName,
          strategy_id: strategyId,
          strategy_name: strategyName,
          symbol: symbol.toUpperCase(),
          params,
          position_size: positionSize,
          initial_capital: initialCapital,
          is_sandbox: isSandbox,
          tradier_api_key: tradierApiKey || null,
          tradier_account_id: tradierAccountId || null,
        }),
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Save failed");
      setDeployed({ id: json.lambda.id, name: json.lambda.name });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to deploy");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setDeployed(null);
    setSaveError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div>
            <h2 className="text-base font-bold text-white">Deploy Strategy</h2>
            <p className="text-xs text-slate-400 mt-0.5">{strategyName}</p>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Success state ─────────────────────────────────────────────────── */}
        {deployed ? (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-base">{deployed.name}</p>
              <p className="text-green-400 text-sm mt-1">Strategy deployed and running</p>
              <p className="text-slate-500 text-xs mt-2 font-mono">{deployed.id}</p>
            </div>
            <a
              href="/paper-trading"
              className="w-full py-2.5 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded-lg text-sm text-center transition-colors"
            >
              View Running Strategies →
            </a>
            <button onClick={handleClose} className="text-sm text-slate-400 hover:text-white">Close</button>
          </div>
        ) : (
          /* ── Configure form ─────────────────────────────────────────────── */
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Name</label>
              <input
                value={lambdaName}
                onChange={e => setLambdaName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Symbol</label>
                <input
                  value={symbol}
                  onChange={e => { const s = e.target.value.toUpperCase(); setSymbol(s); setLambdaName(`${strategyName} on ${s}`); }}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
                  placeholder="SPY"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Shares</label>
                <input
                  type="number" min={1} value={positionSize}
                  onChange={e => setPositionSize(+e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Tradier API Key <span className="normal-case text-slate-500">(sandbox token)</span></label>
              <input
                type="password" value={tradierApiKey}
                onChange={e => setTradierApiKey(e.target.value)}
                placeholder="Get from developer.tradier.com"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Tradier Account ID</label>
              <input
                value={tradierAccountId}
                onChange={e => setTradierAccountId(e.target.value)}
                placeholder="e.g. VA12345678"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2.5">
              <input type="checkbox" id="sbx" checked={isSandbox} onChange={e => setIsSandbox(e.target.checked)} className="w-4 h-4 accent-yellow-400" />
              <label htmlFor="sbx" className="text-sm text-slate-300 cursor-pointer">
                Paper trading mode <span className="text-green-400 text-xs font-semibold">(recommended)</span>
              </label>
            </div>

            {/* Params summary */}
            <div className="bg-slate-900/60 rounded-lg p-3 flex flex-wrap gap-1.5">
              {Object.entries(params).map(([k, v]) => (
                <span key={k} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                  {k}={String(v)}
                </span>
              ))}
            </div>

            {saveError && (
              <div className="bg-red-900/40 border border-red-700/50 rounded-lg px-3 py-2 text-sm text-red-300">{saveError}</div>
            )}

            <button
              onClick={handleDeploy}
              disabled={saving || !symbol || !lambdaName}
              className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 disabled:bg-slate-600 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors text-sm"
            >
              {saving ? "Deploying…" : "🚀 Save & Deploy Strategy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { usePoolState, usePriceHistory } from "@/hooks/usePool";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-ink-muted uppercase tracking-wide">{label}</span>
      <span className="num text-ink font-medium text-sm">{value}</span>
    </div>
  );
}

export default function PoolStats() {
  const { data: pool, isLoading } = usePoolState();
  const { data: history } = usePriceHistory();

  const resT = pool ? (Number(pool.reserveToken) / 1e7).toFixed(4) : "—";
  const resX = pool ? (Number(pool.reserveXlm) / 1e7).toFixed(4) : "—";
  const price = pool
    ? (Number(pool.price) / 1e7).toFixed(7)
    : "—";
  const tvl = pool
    ? (Number(pool.reserveXlm) / 1e7 * 2).toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "—";

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Pool Stats</h2>
        {isLoading && (
          <span className="text-xs text-ink-muted animate-pulse">Refreshing…</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Reserve TKN" value={resT} />
        <Stat label="Reserve XLM" value={resX} />
        <Stat label="TKN/XLM" value={price} />
        <Stat label="TVL (XLM)" value={tvl} />
      </div>

      {/* Price history chart */}
      <div>
        <p className="text-xs text-ink-muted mb-2 uppercase tracking-wide">Price History (TKN/XLM)</p>
        {history && history.length > 1 ? (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={history}>
              <XAxis dataKey="t" hide />
              <YAxis domain={["auto", "auto"]} width={50}
                tick={{ fontSize: 10, fill: "#6B7280", fontFamily: "monospace" }} />
              <Tooltip
                contentStyle={{
                  background: "#FAFAF8",
                  border: "1px solid #E4E0D8",
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
                formatter={(v: number) => [v.toFixed(7), "Price"]}
                labelFormatter={(l) => `Ledger ${l}`}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#E8A020"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[140px] flex items-center justify-center text-sm text-ink-muted border border-dashed border-paper-border rounded-lg">
            No price history yet — execute a swap to start the chart.
          </div>
        )}
      </div>
    </div>
  );
}

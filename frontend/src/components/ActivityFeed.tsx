"use client";

import { useActivity } from "@/hooks/usePool";
import type { ActivityEvent } from "@/hooks/usePool";

const TYPE_LABELS: Record<ActivityEvent["type"], { label: string; color: string }> = {
  swap:   { label: "Swap",   color: "text-amber-dark bg-amber-light" },
  add:    { label: "Add",    color: "text-success bg-green-50" },
  remove: { label: "Remove", color: "text-danger bg-red-50" },
};

export default function ActivityFeed() {
  const { data: events, isLoading } = useActivity();

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Live Activity</h2>
        {isLoading && (
          <span className="flex items-center gap-1 text-xs text-ink-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Live
          </span>
        )}
      </div>

      {events && events.length > 0 ? (
        <ul className="space-y-1.5">
          {events.map((ev) => {
            const { label, color } = TYPE_LABELS[ev.type];
            return (
              <li key={ev.id} className="flex items-center gap-3 text-sm">
                <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${color}`}>
                  {label}
                </span>
                <span className="num text-ink-muted text-xs">Ledger {ev.ledger}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">
          {isLoading ? "Loading…" : "No activity yet."}
        </p>
      )}
    </div>
  );
}

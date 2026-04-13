import type { CouncilHistoryEntry } from "../types";
import { useMemo, useState } from "react";

type HistoryDrawerProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  entries: CouncilHistoryEntry[];
  onClose: () => void;
  onReuseQuestion: (question: string) => void;
};

export function HistoryDrawer({
  open,
  loading,
  error,
  entries,
  onClose,
  onReuseQuestion,
}: HistoryDrawerProps) {
  const [routeFilter, setRouteFilter] = useState<"all" | "assistant-first" | "council">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "yes" | "no" | "conditional" | "info" | "error">("all");

  const visibleEntries = useMemo(() => entries.filter((entry) => {
    const routeOk = routeFilter === "all" || (entry.route ?? "council") === routeFilter;
    const statusOk = statusFilter === "all" || String(entry.status) === statusFilter;
    return routeOk && statusOk;
  }), [entries, routeFilter, statusFilter]);

  return (
    <>
      <button
        type="button"
        className={open ? "history-toggle active" : "history-toggle"}
        onClick={onClose}
        aria-label={open ? "Close history" : "Open history"}
      >
        {open ? "CLOSE" : "HISTORY"}
      </button>

      <aside className={open ? "history-drawer open" : "history-drawer"} aria-hidden={!open}>
        <div className="drawer-header">
          <div>
            <p className="panel-label">COUNCIL MEMORY</p>
            <h2>Recent Questions</h2>
          </div>
          <button type="button" className="drawer-close" onClick={onClose}>
            X
          </button>
        </div>

        {loading ? <p className="drawer-copy">Loading run history...</p> : null}
        {error ? <p className="drawer-alert">{error}</p> : null}

        <div className="history-filter-row">
          <label className="history-filter">
            <span>Route</span>
            <select value={routeFilter} onChange={(event) => setRouteFilter(event.target.value as typeof routeFilter)}>
              <option value="all">All</option>
              <option value="assistant-first">Assistant-first</option>
              <option value="council">Council</option>
            </select>
          </label>
          <label className="history-filter">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="conditional">Conditional</option>
              <option value="info">Info</option>
              <option value="error">Error</option>
            </select>
          </label>
        </div>

        <div className="history-list">
          {visibleEntries.length === 0 && !loading ? (
            <p className="drawer-copy">No history yet in this profile.</p>
          ) : visibleEntries.map((entry) => (
            <article key={entry.id} className="history-item">
              <p className="history-question">{entry.question}</p>
              <p className="history-meta">
                {`ROUTE:${String(entry.route ?? "council").toUpperCase()} | STATUS:${String(entry.status).toUpperCase()} | ${new Date(entry.resolvedAt).toLocaleString()}`}
              </p>
              {entry.outcomeCode ? <p className="history-outcome">{`OUTCOME:${entry.outcomeCode}`}</p> : null}
              <p className="history-decision">{entry.decisionText}</p>
              <div className="history-action-row">
                <button
                  type="button"
                  className="history-action"
                  onClick={() => onReuseQuestion(entry.question)}
                >
                  REUSE QUESTION
                </button>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </>
  );
}

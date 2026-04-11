import type { CouncilHistoryEntry } from "../types";

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

        <div className="history-list">
          {entries.length === 0 && !loading ? (
            <p className="drawer-copy">No history yet in this profile.</p>
          ) : entries.map((entry) => (
            <article key={entry.id} className="history-item">
              <p className="history-question">{entry.question}</p>
              <p className="history-meta">
                {`STATUS:${String(entry.status).toUpperCase()} | ${new Date(entry.resolvedAt).toLocaleString()}`}
              </p>
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

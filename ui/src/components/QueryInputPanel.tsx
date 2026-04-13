import type { RunRoute } from "../types";

type QueryInputPanelProps = {
  value: string;
  promptState: string;
  busy: boolean;
  route: RunRoute;
  highStakesEnabled: boolean;
  systemMessage: string | null;
  verdictText: string;
  canOpenVerdict: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onOpenVerdict: () => void;
  onToggleHighStakes: () => void;
};

export function QueryInputPanel({
  value,
  promptState,
  busy,
  route,
  highStakesEnabled,
  systemMessage,
  verdictText,
  canOpenVerdict,
  onChange,
  onSubmit,
  onClear,
  onOpenVerdict,
  onToggleHighStakes,
}: QueryInputPanelProps) {
  const summaryPreview = verdictText.replace(/\s+/g, " ").trim();
  const dossierLabel = route === "assistant-first"
    ? "OPEN ASSISTANT DOSSIER"
    : "OPEN COUNCIL DOSSIER";
  const outputLabel = route === "assistant-first"
    ? "ASSISTANT OUTPUT"
    : "COUNCIL OUTPUT";

  return (
    <section className="query-panel">
      <div className="query-panel-header">
        <div>
          <p className="panel-label">QUESTION ENTRY</p>
          <h2>Commit To MAGI</h2>
        </div>
        <div className="query-header-actions">
          <button
            type="button"
            className={highStakesEnabled ? "high-stakes-toggle active" : "high-stakes-toggle"}
            onClick={onToggleHighStakes}
            disabled={busy}
          >
            <span>MAGI COUNCIL</span>
            <span className="state">{highStakesEnabled ? "ENABLED" : "OFF (ASSISTANT)"}</span>
          </button>
          <div className={busy ? "state-chip busy" : "state-chip"}>{busy ? "PROCESSING" : "READY"}</div>
        </div>
      </div>

      <label htmlFor="question" className="sr-only">
        Council query
      </label>
      <textarea
        id="question"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask anything. With MAGI Council OFF, MAGI answers directly as your personal AI. Turn MAGI Council ON for strict 3-seat adjudication."
        disabled={busy}
      />

      <p className="query-hint">
        Default is assistant-first. Enable MAGI Council only when you want full governance and seat-level dissent.
      </p>

      {systemMessage ? <p className="query-alert">{systemMessage}</p> : null}
      {verdictText ? (
        <section className="query-result-strip">
          <div className="query-result-copy">
            <span className="panel-label">{outputLabel}</span>
            <p>{summaryPreview}</p>
          </div>
          <button
            type="button"
            className="query-result-open"
            onClick={canOpenVerdict ? onOpenVerdict : undefined}
            disabled={!canOpenVerdict}
          >
            {dossierLabel}
          </button>
        </section>
      ) : null}

      <div className="query-panel-footer">
        <div className="query-meta">
          <span>{`INPUT:${promptState}`}</span>
          <span>{`QUEUE:${busy ? "LOCKED" : "OPEN"}`}</span>
        </div>
        <div className="query-actions">
          <button type="button" className="clear-button" onClick={onClear} disabled={busy}>
            CLEAR
          </button>
          <button type="button" className="submit-button" onClick={onSubmit} disabled={busy}>
            EVALUATE
          </button>
        </div>
      </div>
    </section>
  );
}

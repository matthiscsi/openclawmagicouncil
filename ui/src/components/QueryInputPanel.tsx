type QueryInputPanelProps = {
  value: string;
  promptState: string;
  busy: boolean;
  systemMessage: string | null;
  verdictText: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
};

export function QueryInputPanel({
  value,
  promptState,
  busy,
  systemMessage,
  verdictText,
  onChange,
  onSubmit,
  onClear,
}: QueryInputPanelProps) {
  return (
    <section className="query-panel">
      <div className="query-panel-header">
        <div>
          <p className="panel-label">QUESTION ENTRY</p>
          <h2>Commit To MAGI</h2>
        </div>
        <div className={busy ? "state-chip busy" : "state-chip"}>{busy ? "PROCESSING" : "READY"}</div>
      </div>

      <label htmlFor="question" className="sr-only">
        Council query
      </label>
      <textarea
        id="question"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="State the question clearly. MAGI will classify it, route it through MELCHIOR, BALTHASAR, and CASPER, then lock the final verdict."
        disabled={busy}
      />

      <p className="query-hint">
        Ask one clear decision question at a time, or a non-yes/no question if you want an informational council response.
      </p>

      {systemMessage ? <p className="query-alert">{systemMessage}</p> : null}
      {verdictText ? (
        <div className="query-verdict">
          <span className="panel-label">LATEST VERDICT</span>
          <p>{verdictText}</p>
        </div>
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

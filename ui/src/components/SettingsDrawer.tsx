import type {
  CouncilMode,
  ExecutionPolicy,
  ReasoningEffort,
  ResponseStyle,
  BridgeDiagnostics,
  RuntimeSettings,
} from "../types";

type SettingsDrawerProps = {
  open: boolean;
  settings: RuntimeSettings;
  diagnostics: BridgeDiagnostics | null;
  openclawUrl: string;
  extensionCode: string;
  phaseLabel: string;
  syncLabel: string;
  activeRunId: string | null;
  runtimeError: string | null;
  onSettingsChange: <K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) => void;
  onResetSettings: () => void;
  onClose: () => void;
  onLogout: () => void;
};

type OptionButtonGroupProps<T extends string> = {
  label: string;
  helper: string;
  value: T;
  options: Array<{
    value: T;
    label: string;
    description: string;
  }>;
  onChange: (value: T) => void;
};

function OptionButtonGroup<T extends string>({
  label,
  helper,
  value,
  options,
  onChange,
}: OptionButtonGroupProps<T>) {
  return (
    <section className="setting-block">
      <div className="setting-copy">
        <p className="panel-label">{label}</p>
        <p className="setting-helper">{helper}</p>
      </div>

      <div className="setting-options">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? "setting-option active" : "setting-option"}
            onClick={() => onChange(option.value)}
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const COUNCIL_MODE_OPTIONS: OptionButtonGroupProps<CouncilMode>["options"] = [
  { value: "auto", label: "AUTO", description: "MAGI chooses the council depth." },
  { value: "quick", label: "QUICK", description: "Lean first-pass council." },
  { value: "standard", label: "STANDARD", description: "Normal three-seat review." },
  { value: "critical", label: "CRITICAL", description: "Highest scrutiny and rebuttal pressure." },
];

const REASONING_OPTIONS: OptionButtonGroupProps<ReasoningEffort>["options"] = [
  { value: "auto", label: "AUTO", description: "Use MAGI's normal seat map." },
  { value: "low", label: "LOW", description: "Fast and cost-conscious." },
  { value: "medium", label: "MEDIUM", description: "Balanced reasoning depth." },
  { value: "high", label: "HIGH", description: "Deeper seat effort for serious calls." },
];

const RESPONSE_STYLE_OPTIONS: OptionButtonGroupProps<ResponseStyle>["options"] = [
  { value: "concise", label: "CONCISE", description: "Tighter verdict output." },
  { value: "balanced", label: "BALANCED", description: "Normal decree length." },
  { value: "detailed", label: "DETAILED", description: "More explanation and dissent." },
];

const EXECUTION_POLICY_OPTIONS: OptionButtonGroupProps<ExecutionPolicy>["options"] = [
  { value: "advisory", label: "ADVISORY", description: "Never permit execution from this run." },
  { value: "allowlisted", label: "ALLOWLISTED", description: "Let MAGI decide within its guardrails." },
];

export function SettingsDrawer({
  open,
  settings,
  diagnostics,
  openclawUrl,
  extensionCode,
  phaseLabel,
  syncLabel,
  activeRunId,
  runtimeError,
  onSettingsChange,
  onResetSettings,
  onClose,
  onLogout,
}: SettingsDrawerProps) {
  return (
    <>
      <button
        type="button"
        className={open ? "settings-toggle active" : "settings-toggle"}
        onClick={onClose}
        aria-label={open ? "Close settings" : "Open settings"}
      >
        {open ? "CLOSE" : "SETTINGS"}
      </button>

      <div className={open ? "drawer-backdrop open" : "drawer-backdrop"} onClick={onClose} />

      <aside className={open ? "settings-drawer open" : "settings-drawer"} aria-hidden={!open}>
        <div className="drawer-header">
          <div>
            <p className="panel-label">SYSTEM PANEL</p>
            <h2>MAGI Controls</h2>
          </div>
          <button type="button" className="drawer-close" onClick={onClose}>
            X
          </button>
        </div>

        <div className="drawer-section">
          <div className="drawer-readout">
            <span>{`PHASE:${phaseLabel}`}</span>
            <span>{`EXTENSION:${extensionCode}`}</span>
            <span>{syncLabel}</span>
            <span>{`RUN:${activeRunId ? activeRunId.slice(0, 8).toUpperCase() : "NONE"}`}</span>
          </div>
        </div>

        <details className="drawer-section drawer-details">
          <summary>Diagnostics</summary>
          <div className="drawer-readout">
            <span>{`BRIDGE:${diagnostics ? "ONLINE" : "UNKNOWN"}`}</span>
            <span>{`GATEWAY:${diagnostics?.gatewayReachable ? "REACHABLE" : "UNREACHABLE"}`}</span>
            <span>{`MELCHIOR:${diagnostics?.seatStatus.melchior.status ?? "UNKNOWN"}`}</span>
            <span>{`BALTHASAR:${diagnostics?.seatStatus.balthasar.status ?? "UNKNOWN"}`}</span>
            <span>{`CASPER:${diagnostics?.seatStatus.casper.status ?? "UNKNOWN"}`}</span>
          </div>
        </details>

        <div className="drawer-section">
          <p className="drawer-copy">
            These controls are applied per question through the live MAGI bridge. They do not touch
            your global OpenClaw config or existing services.
          </p>
          <p className="drawer-copy">
            MAGI Council is controlled from the main query panel. When it is OFF, MAGI stays in assistant-first mode.
          </p>
          {runtimeError ? <p className="drawer-alert">{runtimeError}</p> : null}
        </div>

        <div className="drawer-section settings-grid">
          <OptionButtonGroup
            label="COUNCIL MODE"
            helper="Applied only when MAGI Council is enabled from the main screen."
            value={settings.councilMode}
            options={COUNCIL_MODE_OPTIONS}
            onChange={(value) => onSettingsChange("councilMode", value)}
          />

          <OptionButtonGroup
            label="REASONING EFFORT"
            helper="Bias the seat thinking level for this run."
            value={settings.reasoningEffort}
            options={REASONING_OPTIONS}
            onChange={(value) => onSettingsChange("reasoningEffort", value)}
          />

          <OptionButtonGroup
            label="RESPONSE STYLE"
            helper="Control how compact or expanded the final decree should be."
            value={settings.responseStyle}
            options={RESPONSE_STYLE_OPTIONS}
            onChange={(value) => onSettingsChange("responseStyle", value)}
          />

          <OptionButtonGroup
            label="EXECUTION POLICY"
            helper="Keep runs advisory-only, or allow MAGI's normal allowlisted execution rules."
            value={settings.executionPolicy}
            options={EXECUTION_POLICY_OPTIONS}
            onChange={(value) => onSettingsChange("executionPolicy", value)}
          />

        </div>

        <div className="drawer-section drawer-actions">
          <button type="button" className="clear-button" onClick={onResetSettings}>
            RESET DEFAULTS
          </button>
          <a
            className="matrix-button"
            href={openclawUrl}
            target="_blank"
            rel="noreferrer"
          >
            OPEN OPENCLAW
          </a>
          <button type="button" className="matrix-button" onClick={onLogout}>
            LOCK CONSOLE
          </button>
        </div>
      </aside>
    </>
  );
}

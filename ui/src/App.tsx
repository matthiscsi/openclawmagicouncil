import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useReducer,
  useState,
} from "react";
import type { FormEvent } from "react";
import {
  evaluateCouncilQuestion,
  fetchCouncilHistory,
  fetchCouncilRun,
  fetchDiagnostics,
  fetchSessionStatus,
  loginToBridge,
  logoutFromBridge,
} from "./api";
import { CouncilDisplay } from "./components/CouncilDisplay";
import { InspectionModal } from "./components/InspectionModal";
import { CouncilSummaryModal } from "./components/CouncilSummaryModal";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { QueryInputPanel } from "./components/QueryInputPanel";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { MEMBERS } from "./constants";
import {
  councilReducer,
  createAggregationPreview,
  createInitialCouncilState,
  getPhaseLabel,
  getSyncLabel,
} from "./stateMachine";
import type {
  CouncilRunSnapshot,
  FinalCouncilStatus,
  MemberDisplayStatus,
  MemberId,
  MockMemberResponse,
  BridgeDiagnostics,
  CouncilHistoryEntry,
  RuntimeSettings,
} from "./types";

const SETTINGS_STORAGE_KEY = "magi-ui-runtime-settings";

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  councilMode: "auto",
  reasoningEffort: "auto",
  responseStyle: "balanced",
  executionPolicy: "advisory",
  highStakesMode: "normal",
};

function isResolvedStatus(status: MemberDisplayStatus): status is FinalCouncilStatus {
  return status !== "neutral" && status !== "processing";
}

function toMemberResolution(snapshot: CouncilRunSnapshot, memberId: MemberId): MockMemberResponse {
  const member = snapshot.members[memberId];

  return {
    status: isResolvedStatus(member.status) ? member.status : "error",
    response: member.response,
    conditions: member.conditions,
    error: member.error,
    confidence: member.confidence,
    stance: member.stance,
    delayMs: 0,
  };
}

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [draftQuestion, setDraftQuestion] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [submitting, setSubmitting] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<BridgeDiagnostics | null>(null);
  const [historyEntries, setHistoryEntries] = useState<CouncilHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [state, dispatch] = useReducer(councilReducer, undefined, createInitialCouncilState);

  const deferredQuestion = useDeferredValue(draftQuestion);
  const inspectedMember = state.inspection.memberId
    ? state.members[state.inspection.memberId]
    : null;

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const session = await fetchSessionStatus();

        if (cancelled) {
          return;
        }

        setAuthenticated(session.authenticated);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setAuthenticated(false);
        setAuthError(
          error instanceof Error
            ? error.message
            : "The MAGI bridge is offline.",
        );
      } finally {
        if (!cancelled) {
          setAuthChecking(false);
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Partial<RuntimeSettings>;
      setRuntimeSettings({
        councilMode: parsed.councilMode ?? DEFAULT_RUNTIME_SETTINGS.councilMode,
        reasoningEffort: parsed.reasoningEffort ?? DEFAULT_RUNTIME_SETTINGS.reasoningEffort,
        responseStyle: parsed.responseStyle ?? DEFAULT_RUNTIME_SETTINGS.responseStyle,
        executionPolicy: parsed.executionPolicy ?? DEFAULT_RUNTIME_SETTINGS.executionPolicy,
        highStakesMode: parsed.highStakesMode ?? DEFAULT_RUNTIME_SETTINGS.highStakesMode,
      });
    } catch {
      // Ignore malformed local settings and stay on defaults.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(runtimeSettings));
  }, [runtimeSettings]);

  useEffect(() => {
    if (authenticated !== true || !settingsOpen) {
      return;
    }

    let cancelled = false;
    let timerId: number | undefined;

    const pollDiagnostics = async () => {
      try {
        const next = await fetchDiagnostics();
        if (!cancelled) {
          setDiagnostics(next);
        }
      } catch {
        if (!cancelled) {
          setDiagnostics(null);
        }
      } finally {
        if (!cancelled) {
          timerId = window.setTimeout(pollDiagnostics, 5000);
        }
      }
    };

    void pollDiagnostics();

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [authenticated, settingsOpen]);

  useEffect(() => {
    if (authenticated !== true || !historyOpen) {
      setHistoryEntries([]);
      return;
    }

    let cancelled = false;

    const loadHistory = async () => {
      try {
        if (!cancelled) {
          setHistoryLoading(true);
          setHistoryError(null);
        }
        const payload = await fetchCouncilHistory(20);
        if (!cancelled) {
          setHistoryEntries(payload.entries);
        }
      } catch (error) {
        if (!cancelled) {
          setHistoryEntries([]);
          setHistoryError(error instanceof Error ? error.message : "Failed to load run history.");
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [authenticated, historyOpen, state.aggregation.answerId]);

  const syncSnapshot = useEffectEvent((snapshot: CouncilRunSnapshot) => {
    if (state.isYesOrNoAnswerable !== snapshot.isYesOrNoAnswerable) {
      dispatch({
        type: "QUESTION_CLASSIFIED",
        isYesOrNoAnswerable: snapshot.isYesOrNoAnswerable,
      });
    }

    for (const member of MEMBERS) {
      const nextMember = snapshot.members[member.id];
      const currentMember = state.members[member.id];
      const nextFinal = isResolvedStatus(nextMember.status);
      const currentFinal = isResolvedStatus(currentMember.status);

      if (
        nextFinal
        && (
          !currentFinal
          || currentMember.response !== nextMember.response
          || currentMember.conditions !== nextMember.conditions
          || currentMember.error !== nextMember.error
          || currentMember.stance !== nextMember.stance
          || currentMember.confidence !== nextMember.confidence
        )
      ) {
        dispatch({
          type: "MEMBER_RESOLVED",
          memberId: member.id,
          response: toMemberResolution(snapshot, member.id),
        });
      }
    }

    if (
      snapshot.aggregation.fullText
      && (
        state.aggregation.fullText !== snapshot.aggregation.fullText
        || state.aggregation.decisionText !== snapshot.aggregation.decisionText
        || state.aggregation.dissentSummary !== snapshot.aggregation.dissentSummary
      )
    ) {
      dispatch({
        type: "AGGREGATION_DETAILS_UPDATED",
        decisionText: snapshot.aggregation.decisionText,
        dissentSummary: snapshot.aggregation.dissentSummary,
        fullText: snapshot.aggregation.fullText,
      });
    }

    if (snapshot.resolved && state.phase !== "resolved") {
      dispatch({ type: "AGGREGATION_RESOLVED" });
      setActiveRunId(null);
    }
  });

  useEffect(() => {
    if (!activeRunId) {
      return;
    }

    let cancelled = false;
    let timerId: number | undefined;

    const poll = async () => {
      try {
        const snapshot = await fetchCouncilRun(activeRunId);

        if (cancelled) {
          return;
        }

        setRuntimeError(null);
        syncSnapshot(snapshot);

        if (!snapshot.resolved) {
          timerId = window.setTimeout(poll, 900);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setRuntimeError(
          error instanceof Error
            ? error.message
            : "The council state could not be refreshed.",
        );
        timerId = window.setTimeout(poll, 1400);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [activeRunId, syncSnapshot]);

  const handleAuthentication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.trim().length === 0 || authChecking) {
      return;
    }

    setAuthError(null);

    try {
      const session = await loginToBridge(password.trim());

      startTransition(() => {
        setAuthenticated(session.authenticated);
        setPassword("");
      });
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : "The gateway password was rejected.",
      );
    }
  };

  const handleLogout = async () => {
    try {
      await logoutFromBridge();
    } catch {
      // Ignore logout transport failures and clear the local gate anyway.
    }

    startTransition(() => {
      setAuthenticated(false);
      setPassword("");
      setSettingsOpen(false);
      setHistoryOpen(false);
      setVerdictOpen(false);
      setAuthError(null);
      setRuntimeError(null);
      setActiveRunId(null);
      setDiagnostics(null);
      setHistoryEntries([]);
      setHistoryLoading(false);
      setHistoryError(null);
    });
  };

  const submitQuestion = async (question: string) => {
    const trimmed = question.trim();

    if (trimmed.length === 0 || submitting) {
      return;
    }

    setSubmitting(true);
    setRuntimeError(null);

    startTransition(() => {
      dispatch({
        type: "SUBMIT_QUESTION",
        question: trimmed,
      });
      setVerdictOpen(false);
    });

    try {
      const run = await evaluateCouncilQuestion(trimmed, runtimeSettings);

      dispatch({
        type: "QUESTION_CLASSIFIED",
        isYesOrNoAnswerable: run.isYesOrNoAnswerable,
      });
      setActiveRunId(run.id);
    } catch (error) {
      setRuntimeError(
        error instanceof Error
          ? error.message
          : "The MAGI gateway rejected the query.",
      );
      setActiveRunId(null);
    } finally {
      setSubmitting(false);
    }
  };

  const promptState = deferredQuestion.trim().length === 0 ? "WAITING" : "READY";
  const responsePending = submitting || createAggregationPreview(state.aggregation);
  const phaseLabel = getPhaseLabel(state.phase);
  const syncLabel = getSyncLabel(state);
  const canOpenVerdict = (
    state.aggregation.status !== "neutral"
    && state.aggregation.status !== "processing"
    && Boolean(
      state.aggregation.fullText
      || state.aggregation.decisionText
      || state.aggregation.dissentSummary
    )
  );

  const handleSettingsChange = <K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) => {
    setRuntimeSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  if (authenticated !== true) {
    return (
      <div className="boot-shell">
        <div className="boot-panel">
          <div className="boot-title">MAGI</div>
          <div className="boot-subtitle">
            {authChecking ? "LINKING CONTROL SURFACE" : "PRIVATE OPERATOR ACCESS"}
          </div>
          <form className="boot-form" onSubmit={handleAuthentication}>
            <label htmlFor="gateway-password">gateway password</label>
            <input
              id="gateway-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="ENTER SHARED PASSWORD"
              autoComplete="current-password"
              disabled={authChecking}
            />
            {authError ? <p className="boot-error">{authError}</p> : null}
            <button type="submit" disabled={authChecking}>
              {authChecking ? "CHECKING BRIDGE" : "OPEN SYSTEM"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="system-shell">
      <div className={settingsOpen ? "system settings-open" : "system"}>
        <div className="console-topbar">
          <div className="console-mark">
            <div className="console-title">MAGI COUNCIL DECISION SYSTEM</div>
            <div className="console-subtitle">{`PHASE:${phaseLabel}`}</div>
          </div>
        </div>

        <div className="console-layout">
          <QueryInputPanel
            value={draftQuestion}
            promptState={promptState}
            busy={responsePending}
            highStakesEnabled={runtimeSettings.highStakesMode === "strict"}
            systemMessage={runtimeError}
            verdictText={state.aggregation.decisionText}
            canOpenVerdict={canOpenVerdict}
            onChange={setDraftQuestion}
            onSubmit={() => void submitQuestion(draftQuestion)}
            onClear={() => setDraftQuestion("")}
            onOpenVerdict={() => setVerdictOpen(true)}
            onToggleHighStakes={() =>
              setRuntimeSettings((current) => ({
                ...current,
                highStakesMode: current.highStakesMode === "strict" ? "normal" : "strict",
              }))
            }
          />

          <CouncilDisplay
            state={state}
            phaseLabel={phaseLabel}
            syncLabel={syncLabel}
            onInspect={(memberId: MemberId) =>
              dispatch({ type: "OPEN_INSPECTION", memberId })
            }
            onInspectVerdict={() => setVerdictOpen(true)}
          />
        </div>

        <SettingsDrawer
          open={settingsOpen}
          settings={runtimeSettings}
          diagnostics={diagnostics}
          extensionCode={state.extensionCode}
          phaseLabel={phaseLabel}
          syncLabel={syncLabel}
          activeRunId={activeRunId}
          runtimeError={runtimeError}
          onSettingsChange={handleSettingsChange}
          onResetSettings={() => setRuntimeSettings(DEFAULT_RUNTIME_SETTINGS)}
          onClose={() => {
            setSettingsOpen((value) => !value);
            setHistoryOpen(false);
          }}
          onLogout={() => void handleLogout()}
        />

        <HistoryDrawer
          open={historyOpen}
          loading={historyLoading}
          error={historyError}
          entries={historyEntries}
          onClose={() => {
            setHistoryOpen((value) => !value);
            setSettingsOpen(false);
          }}
          onReuseQuestion={(question) => {
            setDraftQuestion(question);
            setHistoryOpen(false);
          }}
        />

        <InspectionModal
          member={inspectedMember}
          question={state.question}
          onClose={() => dispatch({ type: "CLOSE_INSPECTION" })}
        />
        <CouncilSummaryModal
          open={verdictOpen}
          question={state.question}
          aggregation={state.aggregation}
          members={state.members}
          onClose={() => setVerdictOpen(false)}
        />
      </div>
    </div>
  );
}

export default App;

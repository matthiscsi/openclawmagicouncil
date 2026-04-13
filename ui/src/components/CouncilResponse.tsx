import {
  PROCESSING_LABEL,
  RESPONSE_BORDER_COLORS,
  STATUS_ENGLISH_LABELS,
  STATUS_JAPANESE_LABELS,
} from "../constants";
import type { CouncilAggregationState, FinalCouncilStatus, RunRoute } from "../types";

type CouncilResponseProps = {
  route: RunRoute;
  aggregation: CouncilAggregationState;
  onInspectVerdict: () => void;
};

export function CouncilResponse({ route, aggregation, onInspectVerdict }: CouncilResponseProps) {
  const processing = aggregation.questionId !== aggregation.answerId;
  const isResolved =
    aggregation.status !== "neutral" && aggregation.status !== "processing";
  const resolvedStatus: FinalCouncilStatus | null = isResolved
    ? (aggregation.status as FinalCouncilStatus)
    : null;
  const text = resolvedStatus ? STATUS_JAPANESE_LABELS[resolvedStatus] : PROCESSING_LABEL;
  const caption = resolvedStatus
    ? (route === "assistant-first" ? "ASSISTANT" : STATUS_ENGLISH_LABELS[resolvedStatus])
    : "SYNC";
  const color = resolvedStatus ? RESPONSE_BORDER_COLORS[resolvedStatus] : "#ff8d00";
  const clickable = Boolean(
    resolvedStatus && (aggregation.fullText || aggregation.decisionText || aggregation.dissentSummary),
  );

  return (
    <button
      type="button"
      className={`${processing ? "response flicker" : "response"} ${resolvedStatus ? "resolved" : ""} ${clickable ? "clickable" : ""} ${route === "assistant-first" ? "assistant" : "council"}`}
      style={{ color, borderColor: color }}
      onClick={clickable ? onInspectVerdict : undefined}
      disabled={!clickable}
      aria-label={clickable ? "Inspect final MAGI verdict" : "Waiting for final verdict"}
    >
      <div className="inner">
        <div>{text}</div>
        <small>{caption}</small>
        {aggregation.decisionText ? (
          <p className="response-summary">{aggregation.decisionText}</p>
        ) : null}
      </div>
    </button>
  );
}

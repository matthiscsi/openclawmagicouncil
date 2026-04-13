import { STATUS_ENGLISH_LABELS } from "../constants";
import type {
  CouncilAggregationState,
  FinalCouncilStatus,
  MemberDecisionState,
  MemberId,
  RunRoute,
} from "../types";
import { parseSeatResponse, summarizeSeat } from "../utils/councilFormatting";

type CouncilSummaryModalProps = {
  open: boolean;
  question: string;
  route: RunRoute;
  routeReason: string;
  outcomeCode: string;
  councilExecuted: boolean;
  assistantResult: {
    summary: string;
    details: string;
    source: string;
  } | null;
  aggregation: CouncilAggregationState;
  members: Record<MemberId, MemberDecisionState>;
  onClose: () => void;
};

function toSeatStanceLabel(stance: string | null, status: MemberDecisionState["status"]) {
  const normalized = (stance ?? "").trim().toLowerCase();

  if (["revise", "conditional", "mixed", "caution"].includes(normalized)) {
    return "qualified answer with caveats";
  }

  if (["approve", "support", "yes"].includes(normalized) || status === "yes") {
    return "yes";
  }

  if (["refuse", "reject", "deny", "no"].includes(normalized) || status === "no") {
    return "no";
  }

  if (status === "info") {
    return "informational analysis";
  }

  if (status === "error") {
    return "seat error";
  }

  return normalized || status;
}

function extractDetailedBody(fullText: string, decisionText: string) {
  const trimmedFull = fullText.trim();

  if (!trimmedFull) {
    return "";
  }

  const lines = trimmedFull.split(/\r?\n/);
  let index = 0;

  if (/^Question:/i.test(lines[index] ?? "")) {
    index += 1;

    while (index < lines.length && !lines[index].trim()) {
      index += 1;
    }
  }

  if (/^(Council|Assistant) answer:/i.test(lines[index] ?? "")) {
    index += 1;

    while (index < lines.length && !lines[index].trim()) {
      index += 1;
    }
  }

  const remainder = lines.slice(index).join("\n").trim();

  if (!remainder) {
    return "";
  }

  if (remainder === decisionText.trim()) {
    return "";
  }

  return remainder;
}

function extractAssistantExpansion(fullText: string, decisionText: string) {
  const trimmed = fullText.trim();

  if (!trimmed) {
    return "";
  }

  const detailsMatch = trimmed.match(
    /Direct answer details:\s*([\s\S]*?)(?=\n{2,}(?:Route note:|Fallback note:|Seat reasoning:|Notable risks:|$)|$)/i,
  );
  const noteMatch = trimmed.match(/(?:Route note|Fallback note):\s*([\s\S]+)$/i);
  const details = detailsMatch?.[1]?.trim() ?? "";
  const note = noteMatch?.[1]?.trim() ?? "";
  const parts: string[] = [];

  if (details && details !== decisionText.trim()) {
    parts.push(details);
  }

  if (note) {
    parts.push(`Run note: ${note}`);
  }

  if (parts.length > 0) {
    return parts.join("\n\n");
  }

  const genericRemainder = extractDetailedBody(trimmed, decisionText).trim();
  if (!genericRemainder || genericRemainder === decisionText.trim()) {
    return "";
  }

  return genericRemainder;
}

function renderSeatCard(member: MemberDecisionState) {
  const parsed = parseSeatResponse(member.response);
  const confidence = member.confidence !== null
    ? member.confidence.toFixed(2)
    : parsed.confidence;
  const stanceLabel = toSeatStanceLabel(member.stance ?? parsed.stance, member.status);
  const seatAnswer = parsed.answer || parsed.keyPoints[0] || parsed.reasoning[0] || parsed.notes[0] || "No explicit answer returned.";
  const reasoningLines = parsed.reasoning.length > 0
    ? parsed.reasoning
    : parsed.keyPoints.slice(0, 3);
  const notes = parsed.notes.slice(0, 3);

  return (
    <details className="summary-seat-card" key={member.id}>
      <summary className="summary-seat-toggle">
        <div className="summary-seat-header">
          <h4>{member.displayName}</h4>
          <span>{confidence ? `${stanceLabel} (${confidence})` : stanceLabel}</span>
        </div>
        <p className="summary-seat-line">{summarizeSeat(member)}</p>
      </summary>

      <div className="summary-seat-body">
        <p className="summary-seat-role">{member.roleLabel}</p>

        <div className="summary-seat-section">
          <strong>Seat Answer</strong>
          <p>{seatAnswer}</p>
        </div>

        {reasoningLines.length > 0 ? (
          <div className="summary-seat-section">
            <strong>Reasoning</strong>
            <ul>
              {reasoningLines.map((point) => (
                <li key={`${member.id}-kp-${point}`}>{point}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {notes.length > 0 ? (
          <div className="summary-seat-section">
            <strong>Trace Notes</strong>
            <ul>
              {notes.map((note) => (
                <li key={`${member.id}-note-${note}`}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {parsed.risks.length > 0 ? (
          <div className="summary-seat-section risks">
            <strong>Risks</strong>
            <ul>
              {parsed.risks.map((risk) => (
                <li key={`${member.id}-risk-${risk}`}>{risk}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="summary-seat-section">
          <strong>Conditions</strong>
          <p>{member.conditions || "None."}</p>
        </div>
      </div>
    </details>
  );
}

export function CouncilSummaryModal({
  open,
  question,
  route,
  routeReason,
  outcomeCode,
  councilExecuted,
  assistantResult,
  aggregation,
  members,
  onClose,
}: CouncilSummaryModalProps) {
  if (!open) {
    return null;
  }

  const isFinal =
    aggregation.status !== "neutral" && aggregation.status !== "processing";
  const resolvedStatus: FinalCouncilStatus | null = isFinal
    ? (aggregation.status as FinalCouncilStatus)
    : null;
  const assistantFirst = route === "assistant-first";
  const detailedBody = extractDetailedBody(aggregation.fullText || "", aggregation.decisionText || "");
  const assistantExpansion = (assistantResult?.details ?? "").trim()
    || extractAssistantExpansion(aggregation.fullText || "", aggregation.decisionText || "");
  const decreeBody = detailedBody || aggregation.fullText.trim() || "";

  return (
    <div className="modal-shell" onClick={onClose}>
      <div className="modal verdict-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">MAGI DOSSIER</div>
          <button type="button" className="close" onClick={onClose}>
            X
          </button>
        </div>
        <div className="modal-scroll">
          <div className="modal-body verdict-body">
            <section className="summary-block meta">
              <h3>Query</h3>
              <p>{question || "Waiting for query..."}</p>
              <div className="summary-meta-row">
                <span className="summary-chip">
                  STATUS: {resolvedStatus ? STATUS_ENGLISH_LABELS[resolvedStatus] : "PROCESSING"}
                </span>
                <span className="summary-chip">
                  ROUTE: {assistantFirst ? "ASSISTANT-FIRST" : "COUNCIL"}
                </span>
                <span className="summary-chip">
                  COUNCIL EXECUTED: {councilExecuted ? "YES" : "NO"}
                </span>
                <span className="summary-chip">
                  OUTCOME: {outcomeCode || "UNKNOWN"}
                </span>
                <span className="summary-chip">
                  MODE: {resolvedStatus === "conditional" ? "QUALIFIED" : "STANDARD"}
                </span>
              </div>
              {routeReason ? <p className="summary-route-reason">{`Route reason: ${routeReason}`}</p> : null}
            </section>

            <section className="summary-block answer">
              <h3>{assistantFirst ? "Assistant Answer" : "Council Decision"}</h3>
              <p className="summary-answer-text">{aggregation.decisionText || "Pending."}</p>
            </section>

            {assistantFirst ? (
              assistantExpansion ? (
                <section className="summary-block decree">
                  <h3>Expanded Assistant Response</h3>
                  <pre className="verdict-pre">{assistantExpansion}</pre>
                </section>
              ) : null
            ) : (
              <>
                <section className="summary-block dissent">
                  <h3>Dissent Snapshot</h3>
                  <p>{aggregation.dissentSummary || "No dissent was reported."}</p>
                </section>

                <section className="summary-block seats">
                  <h3>Seat Dossiers</h3>
                  <div className="summary-seat-list">
                    {renderSeatCard(members.melchior)}
                    {renderSeatCard(members.balthasar)}
                    {renderSeatCard(members.casper)}
                  </div>
                </section>

                <section className="summary-block decree">
                  <h3>Full Council Decree</h3>
                  <pre className="verdict-pre">
                    {decreeBody || "No additional decree text beyond the final decision."}
                  </pre>
                </section>
              </>
            )}

            {assistantFirst && assistantResult?.source ? (
              <section className="summary-block">
                <h3>Assistant Source</h3>
                <p>{assistantResult.source}</p>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

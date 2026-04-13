import { STATUS_ENGLISH_LABELS } from "../constants";
import type { FinalCouncilStatus, MemberDecisionState } from "../types";
import { parseSeatResponse, summarizeSeat } from "../utils/councilFormatting";

type InspectionModalProps = {
  member: MemberDecisionState | null;
  question: string;
  onClose: () => void;
};

export function InspectionModal({
  member,
  question,
  onClose,
}: InspectionModalProps) {
  if (!member) {
    return null;
  }

  const isFinal =
    member.status !== "neutral" && member.status !== "processing";
  const resolvedStatus: FinalCouncilStatus | null = isFinal
    ? (member.status as FinalCouncilStatus)
    : null;
  const parsed = parseSeatResponse(member.response);
  const seatAnswer = parsed.answer || parsed.keyPoints[0] || parsed.reasoning[0] || parsed.notes[0] || "No explicit answer returned.";
  const reasoningLines = parsed.reasoning.length > 0
    ? parsed.reasoning
    : parsed.keyPoints;
  const notes = parsed.notes;

  return (
    <div className="modal-shell" onClick={onClose}>
      <div className="modal inspection-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{member.displayName}</div>
          <button type="button" className="close" onClick={onClose}>
            X
          </button>
        </div>
        <div className="modal-scroll">
          <div className="modal-body inspection-body">
            <section className="inspection-top">
              <p className="inspection-label">Question</p>
              <p>{question || "Waiting for query..."}</p>
              <p className="inspection-label">Role</p>
              <p>{member.roleSummary}</p>
              <div className="inspection-meta-row">
                <span className="summary-chip">
                  STATUS: {resolvedStatus ? STATUS_ENGLISH_LABELS[resolvedStatus] : "PROCESSING"}
                </span>
                <span className="summary-chip">
                  CONF: {member.confidence !== null ? member.confidence.toFixed(2) : "N/A"}
                </span>
              </div>
            </section>

            <section className="inspection-answer">
              <h3>Seat Answer</h3>
              <p>{seatAnswer}</p>
              <p className="inspection-answer-summary">{summarizeSeat(member)}</p>
            </section>

            {reasoningLines.length > 0 ? (
              <section className="inspection-list">
                <h3>Reasoning</h3>
                <ul>
                  {reasoningLines.map((point) => (
                    <li key={`${member.id}-reason-${point}`}>{point}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {parsed.risks.length > 0 ? (
              <section className="inspection-list risks">
                <h3>Risks</h3>
                <ul>
                  {parsed.risks.map((risk) => (
                    <li key={`${member.id}-risk-${risk}`}>{risk}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {notes.length > 0 ? (
              <section className="inspection-list">
                <h3>Trace Notes</h3>
                <ul>
                  {notes.map((note) => (
                    <li key={`${member.id}-note-${note}`}>{note}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="inspection-list">
              <h3>Conditions</h3>
              <p>{member.conditions || "None."}</p>
              <p className="inspection-error">
                {member.error ? `Seat error: ${member.error}` : "No seat error reported."}
              </p>
            </section>

            <details className="inspection-raw">
              <summary>Raw Seat Payload</summary>
              <pre>{member.response || "No response text."}</pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

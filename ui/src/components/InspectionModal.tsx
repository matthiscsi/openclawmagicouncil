import { STATUS_ENGLISH_LABELS } from "../constants";
import type { FinalCouncilStatus, MemberDecisionState } from "../types";

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

  return (
    <div className="modal-shell" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{member.displayName}</div>
          <button type="button" className="close" onClick={onClose}>
            X
          </button>
        </div>
        <div className="modal-body">
          <div>question:</div>
          <div>{question || "Waiting for query..."}</div>
          <div>role:</div>
          <div>{member.roleSummary}</div>
          <div>status:</div>
          <div>{resolvedStatus ? STATUS_ENGLISH_LABELS[resolvedStatus] : "PROCESSING"}</div>
          <div>stance:</div>
          <div>{member.stance ?? "Pending."}</div>
          <div>confidence:</div>
          <div>{member.confidence !== null ? member.confidence.toFixed(2) : "Pending."}</div>
          <div>error:</div>
          <div>{member.error ?? "None."}</div>
          <div>conditions:</div>
          <div>{member.conditions}</div>
          <div>full response:</div>
          <div>{member.response}</div>
        </div>
      </div>
    </div>
  );
}

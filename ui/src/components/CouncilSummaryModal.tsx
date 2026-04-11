import { STATUS_ENGLISH_LABELS } from "../constants";
import type {
  CouncilAggregationState,
  FinalCouncilStatus,
  MemberDecisionState,
  MemberId,
} from "../types";

type CouncilSummaryModalProps = {
  open: boolean;
  question: string;
  aggregation: CouncilAggregationState;
  members: Record<MemberId, MemberDecisionState>;
  onClose: () => void;
};

export function CouncilSummaryModal({
  open,
  question,
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

  return (
    <div className="modal-shell" onClick={onClose}>
      <div className="modal verdict-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">MAGI COUNCIL SUMMARY</div>
          <button type="button" className="close" onClick={onClose}>
            X
          </button>
        </div>
        <div className="modal-body verdict-body">
          <div>question:</div>
          <div>{question || "Waiting for query..."}</div>
          <div>verdict status:</div>
          <div>{resolvedStatus ? STATUS_ENGLISH_LABELS[resolvedStatus] : "PROCESSING"}</div>
          <div>decision:</div>
          <div>{aggregation.decisionText || "Pending."}</div>
          <div>dissent:</div>
          <div>{aggregation.dissentSummary || "Pending."}</div>
          <div>melchior:</div>
          <div>
            {members.melchior.stance ?? members.melchior.status}
            {members.melchior.confidence !== null ? ` (${members.melchior.confidence.toFixed(2)})` : ""}
          </div>
          <div>balthasar:</div>
          <div>
            {members.balthasar.stance ?? members.balthasar.status}
            {members.balthasar.confidence !== null ? ` (${members.balthasar.confidence.toFixed(2)})` : ""}
          </div>
          <div>casper:</div>
          <div>
            {members.casper.stance ?? members.casper.status}
            {members.casper.confidence !== null ? ` (${members.casper.confidence.toFixed(2)})` : ""}
          </div>
          <div>full decree:</div>
          <pre className="verdict-pre">
            {aggregation.fullText || aggregation.decisionText || "No decree has been published yet."}
          </pre>
        </div>
      </div>
    </div>
  );
}

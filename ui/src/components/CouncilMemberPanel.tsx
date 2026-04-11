import { getDisplayColor, getDisplayTextColor } from "../constants";
import type { MemberDecisionState } from "../types";

type CouncilMemberPanelProps = {
  member: MemberDecisionState;
  onInspect: (memberId: MemberDecisionState["id"]) => void;
};

export function CouncilMemberPanel({
  member,
  onInspect,
}: CouncilMemberPanelProps) {
  const processing = member.questionId !== member.answerId;
  const color = getDisplayColor(member.status);
  const textColor = getDisplayTextColor(member.status);

  return (
    <button
      type="button"
      className={`wise-man ${member.id}`}
      onClick={() => onInspect(member.id)}
      aria-label={`Inspect ${member.displayName}`}
    >
      <div
        className={processing ? "inner flicker" : "inner"}
        style={{ background: color, color: textColor }}
      >
        {member.displayName}
      </div>
    </button>
  );
}

import { EXTENSION_CODES, MEMBERS, PHASE_LABELS } from "./constants";
import type {
  CouncilAggregationState,
  CouncilEvent,
  CouncilMachineState,
  FinalCouncilStatus,
  MemberDecisionState,
  MemberDisplayStatus,
  MemberId,
} from "./types";

export function createInitialCouncilState(): CouncilMachineState {
  return {
    runId: 0,
    phase: "idle",
    question: "",
    extensionCode: EXTENSION_CODES.unknown,
    isYesOrNoAnswerable: null,
    members: buildMembers(0),
    aggregation: {
      questionId: 0,
      answerId: 0,
      status: "neutral",
      decisionText: "",
      dissentSummary: "",
      fullText: "",
    },
    inspection: {
      open: false,
      memberId: null,
    },
  };
}

export function councilReducer(
  state: CouncilMachineState,
  event: CouncilEvent,
): CouncilMachineState {
  switch (event.type) {
    case "SUBMIT_QUESTION": {
      const nextQuestionId = state.runId + 1;

      return {
        ...state,
        runId: nextQuestionId,
        phase: "classifying",
        question: event.question,
        extensionCode: EXTENSION_CODES.unknown,
        isYesOrNoAnswerable: null,
        members: buildMembers(nextQuestionId, "processing"),
        aggregation: {
          questionId: nextQuestionId,
          answerId: nextQuestionId - 1,
          status: "processing",
          decisionText: "",
          dissentSummary: "",
          fullText: "",
        },
        inspection: {
          open: false,
          memberId: null,
        },
      };
    }

    case "QUESTION_CLASSIFIED": {
      return {
        ...state,
        phase: "member_processing",
        isYesOrNoAnswerable: event.isYesOrNoAnswerable,
        extensionCode: event.isYesOrNoAnswerable
          ? EXTENSION_CODES.yesNo
          : EXTENSION_CODES.informational,
      };
    }

    case "MEMBER_SYNCED": {
      const nextMembers = {
        ...state.members,
        [event.memberId]: {
          ...state.members[event.memberId],
          answerId: state.runId,
          status: event.status,
          response: event.response,
          conditions: event.conditions,
          error: event.error,
          confidence: event.confidence ?? null,
          stance: event.stance ?? null,
        },
      };

      return {
        ...state,
        phase: allMembersResolved(nextMembers) ? "aggregating" : state.phase,
        members: nextMembers,
      };
    }

    case "AGGREGATION_DETAILS_UPDATED": {
      return {
        ...state,
        aggregation: {
          ...state.aggregation,
          status: event.status,
          decisionText: event.decisionText,
          dissentSummary: event.dissentSummary,
          fullText: event.fullText,
        },
      };
    }

    case "AGGREGATION_RESOLVED": {
      const currentStatus = state.aggregation.status;
      const resolvedStatus = (
        currentStatus !== "neutral" && currentStatus !== "processing"
      )
        ? currentStatus
        : aggregateCouncilStatus(
          nextMemberStatuses(state.members),
          state.isYesOrNoAnswerable,
        );

      return {
        ...state,
        phase: "resolved",
        aggregation: {
          ...state.aggregation,
          questionId: state.runId,
          answerId: state.runId,
          status: resolvedStatus,
        },
      };
    }

    case "OPEN_INSPECTION": {
      return {
        ...state,
        inspection: {
          open: true,
          memberId: event.memberId,
        },
      };
    }

    case "CLOSE_INSPECTION": {
      return {
        ...state,
        inspection: {
          open: false,
          memberId: null,
        },
      };
    }

    default:
      return state;
  }
}

export function aggregateCouncilStatus(
  statuses: FinalCouncilStatus[],
  isYesOrNoAnswerable: boolean | null,
) {
  if (statuses.some((status) => status === "error")) {
    return "error";
  }

  if (isYesOrNoAnswerable === false) {
    return "info";
  }

  if (statuses.some((status) => status === "no")) {
    return "no";
  }

  if (statuses.some((status) => status === "conditional")) {
    return "conditional";
  }

  if (statuses.every((status) => status === "yes")) {
    return "yes";
  }

  return "info";
}

export function getPhaseLabel(phase: CouncilMachineState["phase"]) {
  return PHASE_LABELS[phase];
}

export function getSyncLabel(state: CouncilMachineState) {
  if (state.phase === "idle") {
    return "SYNC:STABLE";
  }

  if (state.phase === "resolved") {
    return `SYNC:Q-${String(state.runId).padStart(4, "0")}`;
  }

  return `SYNC:Q-${String(state.runId).padStart(4, "0")} PENDING`;
}

export function createAggregationPreview(state: CouncilAggregationState) {
  return state.questionId !== state.answerId;
}

function buildMembers(questionId: number, status: MemberDisplayStatus = "neutral") {
  return MEMBERS.reduce<Record<MemberId, MemberDecisionState>>((accumulator, member) => {
    accumulator[member.id] = {
      id: member.id,
      displayName: member.displayName,
      orderNumber: member.orderNumber,
      roleLabel: member.roleLabel,
      roleSummary: member.roleSummary,
      personality: member.personality,
      questionId,
      answerId: questionId === 0 ? 0 : questionId - 1,
      status,
      response: status === "processing" ? "PROCESSING..." : "Waiting for query...",
      conditions: status === "processing" ? "Pending." : "None.",
      error: null,
      confidence: null,
      stance: null,
    };

    return accumulator;
  }, {} as Record<MemberId, MemberDecisionState>);
}

function allMembersResolved(members: Record<MemberId, MemberDecisionState>) {
  return Object.values(members).every((member) =>
    ["yes", "no", "conditional", "info", "error"].includes(member.status),
  );
}

function nextMemberStatuses(members: Record<MemberId, MemberDecisionState>) {
  return Object.values(members).map((member) => member.status).filter(isFinalStatus);
}

function isFinalStatus(status: MemberDisplayStatus): status is FinalCouncilStatus {
  return status !== "neutral" && status !== "processing";
}

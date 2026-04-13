export type MemberId = "melchior" | "balthasar" | "casper";

export type CouncilMode = "auto" | "quick" | "standard" | "critical";

export type ReasoningEffort = "auto" | "low" | "medium" | "high";

export type ResponseStyle = "concise" | "balanced" | "detailed";

export type RunRoute = "assistant-first" | "council";

export type ExecutionPolicy = "advisory" | "allowlisted";

export type HighStakesMode = "normal" | "strict";

export type RuntimeSettings = {
  councilMode: CouncilMode;
  reasoningEffort: ReasoningEffort;
  responseStyle: ResponseStyle;
  executionPolicy: ExecutionPolicy;
  highStakesMode: HighStakesMode;
};

export type BridgeDiagnostics = {
  bridge: "online";
  gatewayReachable: boolean;
  seatStatus: Record<
    MemberId,
    {
      known: boolean;
      updatedAt: number | null;
      sessionKey: string | null;
      status: string | null;
    }
  >;
};

export type CouncilHistoryEntry = {
  id: string;
  question: string;
  createdAt: number;
  resolvedAt: number;
  schemaVersion?: number;
  route?: RunRoute;
  routeReason?: string;
  councilExecuted?: boolean;
  outcomeCode?: string;
  isYesOrNoAnswerable: boolean;
  status: CouncilDisplayStatus;
  decisionText: string;
  dissentSummary: string;
  members: Record<MemberId, string>;
};

export type FinalCouncilStatus = "yes" | "no" | "conditional" | "info" | "error";

export type MemberDisplayStatus =
  | "neutral"
  | "processing"
  | FinalCouncilStatus;

export type CouncilDisplayStatus =
  | "neutral"
  | "processing"
  | FinalCouncilStatus;

export type CouncilPhase =
  | "idle"
  | "classifying"
  | "member_processing"
  | "aggregating"
  | "resolved";

export type MemberDefinition = {
  id: MemberId;
  orderNumber: 1 | 2 | 3;
  displayName: string;
  roleLabel: string;
  roleSummary: string;
  personality: string;
};

export type MockMemberResponse = {
  status: FinalCouncilStatus;
  response: string;
  conditions: string;
  error: string | null;
  confidence?: number | null;
  stance?: string | null;
  delayMs: number;
};

export type MockScenario = {
  id: string;
  label: string;
  question: string;
  description: string;
  isYesOrNoAnswerable: boolean;
  members: Record<MemberId, MockMemberResponse>;
};

export type MemberDecisionState = {
  id: MemberId;
  displayName: string;
  orderNumber: number;
  roleLabel: string;
  roleSummary: string;
  personality: string;
  questionId: number;
  answerId: number;
  status: MemberDisplayStatus;
  response: string;
  conditions: string;
  error: string | null;
  confidence: number | null;
  stance: string | null;
};

export type CouncilAggregationState = {
  questionId: number;
  answerId: number;
  status: CouncilDisplayStatus;
  decisionText: string;
  dissentSummary: string;
  fullText: string;
};

export type InspectionState = {
  open: boolean;
  memberId: MemberId | null;
};

export type CouncilMachineState = {
  runId: number;
  phase: CouncilPhase;
  question: string;
  extensionCode: string;
  isYesOrNoAnswerable: boolean | null;
  members: Record<MemberId, MemberDecisionState>;
  aggregation: CouncilAggregationState;
  inspection: InspectionState;
};

export type CouncilRunSnapshot = {
  id: string;
  question: string;
  isYesOrNoAnswerable: boolean;
  sessionId: string | null;
  route?: RunRoute;
  routeReason?: string;
  councilExecuted?: boolean;
  outcomeCode?: string;
  assistantResult?: {
    summary: string;
    details: string;
    source: string;
  } | null;
  seatResults?: Partial<Record<
    MemberId,
    {
      status: MemberDisplayStatus;
      response: string;
      conditions: string;
      error: string | null;
      confidence: number | null;
      stance: string | null;
    }
  >>;
  members: Record<
    MemberId,
    {
      status: MemberDisplayStatus;
      response: string;
      conditions: string;
      error: string | null;
      confidence: number | null;
      stance: string | null;
    }
  >;
  aggregation: {
    status: CouncilDisplayStatus;
    decisionText: string;
    dissentSummary: string;
    fullText: string;
  };
  phase: CouncilPhase;
  resolved: boolean;
};

export type CouncilEvent =
  | {
      type: "SUBMIT_QUESTION";
      question: string;
    }
  | {
      type: "QUESTION_CLASSIFIED";
      isYesOrNoAnswerable: boolean;
    }
  | {
      type: "MEMBER_SYNCED";
      memberId: MemberId;
      status: MemberDisplayStatus;
      response: string;
      conditions: string;
      error: string | null;
      confidence: number | null;
      stance: string | null;
    }
  | {
      type: "AGGREGATION_DETAILS_UPDATED";
      status: CouncilDisplayStatus;
      decisionText: string;
      dissentSummary: string;
      fullText: string;
    }
  | {
      type: "AGGREGATION_RESOLVED";
    }
  | {
      type: "OPEN_INSPECTION";
      memberId: MemberId;
    }
  | {
      type: "CLOSE_INSPECTION";
    };

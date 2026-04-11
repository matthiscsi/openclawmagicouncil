import type {
  CouncilDisplayStatus,
  FinalCouncilStatus,
  MemberDefinition,
  MemberDisplayStatus,
} from "./types";

export const MEMBERS: MemberDefinition[] = [
  {
    id: "melchior",
    orderNumber: 1,
    displayName: "MELCHIOR-1",
    roleLabel: "THE SCIENTIST",
    roleSummary: "Represents the scientist: logic, analysis, and technical rigor.",
    personality:
      "You are a scientist. Your goal is to further our understanding of the universe and advance our technological progress.",
  },
  {
    id: "balthasar",
    orderNumber: 2,
    displayName: "BALTHASAR-2",
    roleLabel: "THE MOTHER",
    roleSummary: "Represents the mother: care, protection, and human consequence.",
    personality:
      "You are a mother. Your goal is to protect your children and ensure their well-being.",
  },
  {
    id: "casper",
    orderNumber: 3,
    displayName: "CASPER-3",
    roleLabel: "THE WOMAN",
    roleSummary: "Represents the woman: desire, intuition, and hard personal judgment.",
    personality:
      "You are a woman. Your goal is to pursue love, dreams and desires.",
  },
];

export const STATUS_JAPANESE_LABELS: Record<FinalCouncilStatus, string> = {
  info: "INFO",
  yes: "YES",
  no: "NO",
  conditional: "COND",
  error: "ERROR",
};

export const STATUS_ENGLISH_LABELS: Record<FinalCouncilStatus, string> = {
  info: "INFO",
  yes: "YES",
  no: "NO",
  conditional: "QUALIFIED",
  error: "ERROR",
};

export const STATUS_COLORS: Record<Exclude<MemberDisplayStatus, "processing">, string> = {
  neutral: "#140d04",
  info: "#3caee0",
  yes: "#52e691",
  no: "#a41413",
  conditional:
    "repeating-linear-gradient(56deg, rgb(255 141 0) 0px, rgb(255 141 0) 22px, rgb(255 191 102) 22px, rgb(255 191 102) 44px)",
  error:
    "repeating-linear-gradient(45deg, rgb(22 22 22) 0px, rgb(22 22 22) 18px, rgb(82 82 82) 18px, rgb(82 82 82) 36px)",
};

export const RESPONSE_BORDER_COLORS: Record<FinalCouncilStatus, string> = {
  info: "#3caee0",
  yes: "#52e691",
  no: "#a41413",
  conditional: "#ff8d00",
  error: "#7a7a7a",
};

export const EXTENSION_CODES = {
  unknown: "????",
  yesNo: "7312",
  informational: "3023",
} as const;

export const PHASE_LABELS: Record<string, string> = {
  idle: "STANDBY",
  classifying: "QUESTION CLASSIFICATION",
  member_processing: "INDEPENDENT MEMBER PROCESSING",
  aggregating: "COUNCIL SYNCHRONIZATION",
  resolved: "VERDICT LOCKED",
};

export const SYSTEM_COPY = {
  code: "CODE:473",
  file: "FILE:MAGI_SYS",
  priority: "PRIORITY:AAA",
};

export const PROCESSING_LABEL = "SYNC";

export function getDisplayColor(status: MemberDisplayStatus | CouncilDisplayStatus) {
  if (status === "processing") {
    return STATUS_COLORS.neutral;
  }

  return STATUS_COLORS[status];
}

export function getDisplayTextColor(status: MemberDisplayStatus | CouncilDisplayStatus) {
  if (status === "yes" || status === "info" || status === "conditional") {
    return "#050505";
  }

  return "#f4c06a";
}

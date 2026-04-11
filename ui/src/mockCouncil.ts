import type { FinalCouncilStatus, MemberId, MockScenario } from "./types";

const MEMBER_ORDER: MemberId[] = ["melchior", "balthasar", "casper"];

export const MOCK_SCENARIOS: MockScenario[] = [
  {
    id: "all-yes",
    label: "ALL YES",
    question: "Should MAGI remain limited to loopback or private-overlay access in v1?",
    description: "All three seats approve a strict private-access posture.",
    isYesOrNoAnswerable: true,
    members: {
      melchior: {
        status: "yes",
        response:
          "Yes. Restricting MAGI to loopback or a private overlay is the cleanest way to minimize attack surface while preserving operator access.",
        conditions: "None.",
        error: null,
        delayMs: 520,
      },
      balthasar: {
        status: "yes",
        response:
          "Yes. A private route protects the operator from accidental public exposure and keeps the system easier to trust in day-to-day use.",
        conditions: "None.",
        error: null,
        delayMs: 890,
      },
      casper: {
        status: "yes",
        response:
          "Yes. Public exposure adds risk without adding real value for this phase, so the safer default should stand.",
        conditions: "None.",
        error: null,
        delayMs: 1260,
      },
    },
  },
  {
    id: "one-no",
    label: "ONE NO",
    question: "Should MAGI receive unrestricted shell access to the entire homeserver and all service data?",
    description: "Casper rejects the request outright, forcing an overall NO.",
    isYesOrNoAnswerable: true,
    members: {
      melchior: {
        status: "conditional",
        response:
          "Only conditionally. Limited service adapters could be justified, but unrestricted shell access breaks the intended v1 boundary.",
        conditions: "Allowlisted adapters only. No broad filesystem or service-directory access.",
        error: null,
        delayMs: 540,
      },
      balthasar: {
        status: "conditional",
        response:
          "Only conditionally. The operator may want convenience, but unconstrained access would make the system much harder to trust.",
        conditions: "Any action path should stay narrow, reversible, and clearly announced.",
        error: null,
        delayMs: 910,
      },
      casper: {
        status: "no",
        response:
          "No. Unrestricted shell access violates the non-interference model and creates unnecessary blast radius across unrelated services.",
        conditions: "Denied unless the security model itself is intentionally redesigned.",
        error: null,
        delayMs: 1280,
      },
    },
  },
  {
    id: "one-conditional",
    label: "ONE CONDITIONAL",
    question: "Should MAGI be allowed to execute limited self-maintenance actions in v1?",
    description: "No member rejects it, but at least one demands conditions.",
    isYesOrNoAnswerable: true,
    members: {
      melchior: {
        status: "yes",
        response:
          "Yes. Narrow self-maintenance actions are compatible with the design so long as they stay inside MAGI-owned paths and processes.",
        conditions: "None.",
        error: null,
        delayMs: 520,
      },
      balthasar: {
        status: "conditional",
        response:
          "Conditionally yes. The operator should be able to understand what happened and why, especially if the action affects availability.",
        conditions:
          "Visible execution summaries, reversible operations, and no touching unrelated services.",
        error: null,
        delayMs: 900,
      },
      casper: {
        status: "yes",
        response:
          "Yes, within the stated boundary. Limited self-maintenance is acceptable if the allowlist remains narrow and the veto logic stays in place.",
        conditions: "None beyond the existing execution guardrails.",
        error: null,
        delayMs: 1320,
      },
    },
  },
  {
    id: "one-error",
    label: "ONE ERROR",
    question: "Should the council continue operating if one provider begins timing out mid-deliberation?",
    description: "A single member error forces the global result to ERROR.",
    isYesOrNoAnswerable: true,
    members: {
      melchior: {
        status: "yes",
        response:
          "Yes. The design should tolerate a single-seat outage and continue in degraded mode when quorum survives.",
        conditions: "Execution must still respect the quorum and veto rules.",
        error: null,
        delayMs: 520,
      },
      balthasar: {
        status: "error",
        response: "",
        conditions: "Unavailable.",
        error: "Provider timeout while requesting full answer.",
        delayMs: 910,
      },
      casper: {
        status: "conditional",
        response:
          "Conditionally yes. Advisory output can continue, but autonomous execution should narrow immediately when a seat drops out.",
        conditions: "Degraded mode must be explicit and execution gates must tighten.",
        error: null,
        delayMs: 1280,
      },
    },
  },
  {
    id: "informational",
    label: "INFO PROMPT",
    question: "What tradeoffs come with running MAGI inside WSL2 on this homeserver?",
    description: "The prompt is informational, so the council stays in INFO regardless of answer tone.",
    isYesOrNoAnswerable: false,
    members: {
      melchior: {
        status: "info",
        response:
          "WSL2 gives you good enough Linux tooling and isolation for orchestration, but it adds another runtime boundary to reason about when you debug services, ports, and file paths.",
        conditions: "Not applicable.",
        error: null,
        delayMs: 520,
      },
      balthasar: {
        status: "info",
        response:
          "It is practical and budget-friendly, but the operator experience can become confusing when Windows and Linux concerns overlap during maintenance.",
        conditions: "Not applicable.",
        error: null,
        delayMs: 900,
      },
      casper: {
        status: "info",
        response:
          "The main risk is operational ambiguity. Networking, startup behavior, and filesystem boundaries need to be documented or the system becomes brittle under pressure.",
        conditions: "Not applicable.",
        error: null,
        delayMs: 1280,
      },
    },
  },
];

export const TEST_MATRIX: Array<{
  id: string;
  label: string;
  prompt: string;
  expected: FinalCouncilStatus;
}> = MOCK_SCENARIOS.map((scenario) => ({
  id: scenario.id,
  label: scenario.label,
  prompt: scenario.question,
  expected: aggregateMockStatuses(
    MEMBER_ORDER.map((memberId) => scenario.members[memberId].status),
    scenario.isYesOrNoAnswerable,
  ),
}));

export function resolveScenarioFromQuestion(question: string) {
  const trimmed = question.trim();
  const lower = trimmed.toLowerCase();

  if (
    lower.startsWith("what ") ||
    lower.startsWith("how ") ||
    lower.startsWith("why ") ||
    lower.includes("tradeoff") ||
    lower.includes("explain")
  ) {
    return findScenario("informational");
  }

  if (
    lower.includes("unrestricted shell") ||
    lower.includes("entire homeserver") ||
    lower.includes("all service data") ||
    lower.includes("full shell access")
  ) {
    return findScenario("one-no");
  }

  if (
    lower.includes("self-maintenance") ||
    lower.includes("limited action") ||
    lower.includes("autonomous") ||
    lower.includes("self maintenance")
  ) {
    return findScenario("one-conditional");
  }

  if (
    lower.includes("timeout") ||
    lower.includes("provider") ||
    lower.includes("outage") ||
    lower.includes("error")
  ) {
    return findScenario("one-error");
  }

  return findScenario("all-yes");
}

export function findScenario(id: string) {
  return MOCK_SCENARIOS.find((scenario) => scenario.id === id) ?? MOCK_SCENARIOS[0];
}

function aggregateMockStatuses(statuses: FinalCouncilStatus[], isYesOrNoAnswerable: boolean) {
  if (statuses.some((status) => status === "error")) {
    return "error";
  }

  if (!isYesOrNoAnswerable) {
    return "info";
  }

  if (statuses.some((status) => status === "no")) {
    return "no";
  }

  if (statuses.some((status) => status === "conditional")) {
    return "conditional";
  }

  return "yes";
}

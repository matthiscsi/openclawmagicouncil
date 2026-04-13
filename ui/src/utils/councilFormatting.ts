import type { MemberDecisionState } from "../types";

export type ParsedSeatResponse = {
  stance: string | null;
  confidence: string | null;
  answer: string | null;
  reasoning: string[];
  keyPoints: string[];
  risks: string[];
  notes: string[];
};

export function parseSeatResponse(response: string): ParsedSeatResponse {
  const lines = response.split(/\r?\n/).map((line) => line.trim());
  const parsed: ParsedSeatResponse = {
    stance: null,
    confidence: null,
    answer: null,
    reasoning: [],
    keyPoints: [],
    risks: [],
    notes: [],
  };

  let section: "none" | "reasoning" | "keyPoints" | "risks" = "none";
  const headingPattern = /^([A-Z _-]+):\s*(.*)$/i;

  for (const line of lines) {
    if (!line) {
      continue;
    }

    const headingMatch = line.match(headingPattern);
    if (headingMatch) {
      const heading = headingMatch[1].trim().toUpperCase();
      const remainder = headingMatch[2].trim();

      if (heading === "STANCE") {
        parsed.stance = remainder || null;
        section = "none";
        continue;
      }

      if (heading === "CONFIDENCE") {
        parsed.confidence = remainder || null;
        section = "none";
        continue;
      }

      if (heading === "ANSWER" || heading === "CONCLUSION" || heading === "DECISION") {
        parsed.answer = remainder || parsed.answer;
        section = "none";
        continue;
      }

      if (heading === "REASONING" || heading === "RATIONALE" || heading === "ANALYSIS") {
        section = "reasoning";
        if (remainder) {
          parsed.reasoning.push(remainder);
        }
        continue;
      }

      if (heading === "KEY POINTS" || heading === "KEYPOINTS") {
        section = "keyPoints";
        if (remainder) {
          parsed.keyPoints.push(remainder);
        }
        continue;
      }

      if (heading === "RISKS" || heading === "RISK") {
        section = "risks";
        if (remainder) {
          parsed.risks.push(remainder);
        }
        continue;
      }

      section = "none";
    }

    if (line.startsWith("- ")) {
      const value = line.slice(2).trim();
      if (!value) {
        continue;
      }

      if (section === "keyPoints") {
        parsed.keyPoints.push(value);
        continue;
      }

      if (section === "risks") {
        parsed.risks.push(value);
        continue;
      }

      if (section === "reasoning") {
        parsed.reasoning.push(value);
        continue;
      }
    }

    if (section === "reasoning") {
      parsed.reasoning.push(line);
      continue;
    }

    if (section === "keyPoints") {
      parsed.keyPoints.push(line);
      continue;
    }

    if (section === "risks") {
      parsed.risks.push(line);
      continue;
    }

    parsed.notes.push(line);
  }

  return parsed;
}

export function summarizeSeat(member: MemberDecisionState): string {
  const parsed = parseSeatResponse(member.response);
  const confidence =
    member.confidence !== null
      ? member.confidence.toFixed(2)
      : parsed.confidence;
  const stance = member.stance ?? parsed.stance ?? member.status;
  const firstPoint = parsed.answer
    ?? parsed.keyPoints[0]
    ?? parsed.reasoning[0]
    ?? parsed.notes[0]
    ?? "No detailed rationale returned.";

  return `${stance}${confidence ? ` (${confidence})` : ""}: ${firstPoint}`;
}

import type { CouncilRunSnapshot, RuntimeSettings } from "./types";

type SessionStatus = {
  authenticated: boolean;
};

type EvaluationResponse = {
  id: string;
  question: string;
  isYesOrNoAnswerable: boolean;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const payload = await response.json() as { error?: string };
      errorMessage = payload.error ?? errorMessage;
    } catch {
      // Ignore parse failures and fall back to the default message.
    }

    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

export async function fetchSessionStatus() {
  return requestJson<SessionStatus>("/api/auth/session", {
    method: "GET",
  });
}

export async function loginToBridge(password: string) {
  return requestJson<SessionStatus>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function logoutFromBridge() {
  return requestJson<SessionStatus>("/api/auth/logout", {
    method: "POST",
  });
}

export async function evaluateCouncilQuestion(question: string, options: RuntimeSettings) {
  return requestJson<EvaluationResponse>("/api/council/evaluate", {
    method: "POST",
    body: JSON.stringify({ question, options }),
  });
}

export async function fetchCouncilRun(runId: string) {
  return requestJson<CouncilRunSnapshot>(`/api/council/runs/${encodeURIComponent(runId)}`, {
    method: "GET",
  });
}

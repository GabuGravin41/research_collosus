export interface BackendStartResponse {
  session_id: number;
}

export interface BackendTask {
  id: number;
  description: string;
  assigned_to: string;
  status: string;
  priority: number;
  result?: string | null;
  python_code?: string | null;
  experiment_spec?: any | null;
  dependencies?: string[] | null;
}

export interface BackendBranch {
  id: number;
  name: string;
  status: string;
  tasks: BackendTask[];
}

export interface BackendLog {
  id: number;
  agent_name: string;
  message: string;
  type: string;
  timestamp: string;
}

export interface BackendKnowledge {
  id: number;
  content: string;
  source_agent: string;
  confidence: number;
  created_at: string;
}

export interface BackendStateResponse {
  session: {
    id: number;
    original_prompt: string;
    status: string;
    created_at: string;
    final_synthesis?: string | null;
  };
  branches: BackendBranch[];
  logs: BackendLog[];
  knowledge: BackendKnowledge[];
}

import type { Attachment } from "../types";

const API_BASE =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export async function startResearch(prompt: string, attachments: Attachment[] = []): Promise<number> {
  const res = await fetch(`${API_BASE}/research/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, attachments }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Unknown error" }));
    const message = errorData.detail || `Failed to start research (${res.status})`;
    
    // Add specific handling for quota errors
    if (res.status === 503 && message.includes("quota")) {
      throw new Error(`⚠️ Gemini API Quota Exhausted\n\n${message}`);
    }
    
    throw new Error(message);
  }
  const data: BackendStartResponse = await res.json();
  return data.session_id;
}

export async function fetchResearchState(
  sessionId: number
): Promise<BackendStateResponse> {
  const res = await fetch(`${API_BASE}/research/${sessionId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch research state (${res.status})`);
  }
  return res.json();
}

export async function toggleBranchPause(branchId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/research/pause/${branchId}`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to toggle branch (${res.status})`);
  }
}

export async function transcribeSpeech(blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, "audio.webm");

  const res = await fetch(`${API_BASE}/research/stt`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error: any = new Error(`Failed to transcribe audio (${res.status})`);
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  return data.transcript as string;
}



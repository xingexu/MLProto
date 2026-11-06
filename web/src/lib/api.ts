export type Status =
  | "NOT_PUBLISHED"
  | "DRAFT"
  | "NOT_YET_EFFECTIVE"
  | "IN_FORCE"
  | "SUPERSEDED"
  | "GRANDFATHERED"
  | "NONE";

export type Mode = "lifecycle" | "recency" | "baseline";

export interface Citation {
  passage_id: string;
  regulation: string;
  regulation_title: string;
  document: string;
  kind: "guideline" | "letter" | "draft";
  published: string;
  effective_from: string | null;
  heading: string;
  text: string;
  source_url: string;
  verification: string;
}

export interface Candidate {
  passage_id: string;
  document: string;
  kind: string;
  published: string;
  effective_from: string | null;
  status: Status;
}

export interface Answer {
  mode: Mode;
  question: string;
  as_of: string;
  status: Status;
  answer: string;
  citation: Citation | null;
  rule_key: string | null;
  true_status: Status | null;
  previous: Citation | null;
  upcoming: Citation[];
  notes: string[];
  candidates: Candidate[];
}

export interface DocumentInfo {
  doc_id: string;
  reg_id: string;
  kind: string;
  title: string;
  published: string;
  source_url: string;
  verification: string;
}

export interface Regulation {
  id: string;
  title: string;
  regulator: string;
  topic: string;
  rules: string[];
  documents: DocumentInfo[];
}

export interface TimelineVersion {
  passage_id: string;
  heading: string;
  answer: string;
  document: string;
  doc_id: string;
  kind: string;
  published: string;
  effective_from: string | null;
  status: Status;
  source_url: string;
  verification: string;
}

export interface Timeline {
  regulation: { id: string; title: string; regulator: string; topic: string };
  as_of: string;
  rules: { rule_key: string; heading: string; versions: TimelineVersion[] }[];
}

export interface EvalRow {
  qid: string;
  type: string;
  question: string;
  as_of: string;
  expected_status: Status;
  accepted: string[];
  cited: string | null;
  claimed_status: Status;
  true_status: Status | null;
  rule_hit: boolean;
  correct: boolean;
  confident_stale: boolean;
}

export interface EvalMode {
  accuracy: number;
  confident_stale_rate: number;
  rule_hit_rate: number;
  by_type: Record<string, { n: number; accuracy: number }>;
  rows: EvalRow[];
}

export interface EvalReport {
  n_questions: number;
  modes: Record<Mode, EvalMode>;
}

export interface WatchItem {
  id: number;
  regulationId: string;
  note: string | null;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields?: Record<string, string>) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = (body ?? {}) as { detail?: string; errors?: Record<string, string> };
    throw new ApiError(b.detail ?? `Request failed (${res.status}).`, res.status, b.errors);
  }
  return body as T;
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Formats an ISO date (YYYY-MM-DD) without time-zone shifts. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export interface TestOption {
  idx: number;
  kind: "image" | "text";
  text?: string | null;
  image?: string | null;
}

export interface TestQuestion {
  id: number;
  type: string;
  category: string;
  prompt: string;
  puzzleImage: string | null;
  options: TestOption[];
}

export interface Integrity {
  blur: number;
  awayMs: number;
  fsExits: number;
  paste: number;
  devtools: boolean;
}

export interface StartResponse {
  attemptToken: string;
  question: TestQuestion;
  nonce: string;
  index: number;
  total: number;
  settings: { questionSeconds: number };
  watermark: string;
  practice: boolean;
}

export interface SubmitResult {
  correct: number;
  total: number;
  percent: number;
  byCategory: Record<string, { correct: number; total: number }>;
  durationMs: number;
  practice: boolean;
  flagged?: boolean;
  reasons?: string[];
}

export interface AnswerResponse {
  done: boolean;
  question?: TestQuestion;
  nonce?: string;
  index?: number;
  total?: number;
  result?: SubmitResult;
}

export interface ScoreRow {
  rank: number;
  name: string;
  correct: number;
  total: number;
  percent: number;
  duration_ms: number | null;
  created_at: string;
}

export interface AnswerInput {
  id: number;
  selectedIndex: number | null;
}

// ---- admin types ----
export interface Voucher {
  code: string;
  type: "single" | "admin";
  used: boolean;
  used_by: string | null;
  used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface AdminScore {
  id: number;
  name: string;
  voucher_code: string | null;
  correct: number;
  total: number;
  percent: number;
  duration_ms: number | null;
  excluded: boolean;
  flagged?: boolean;
  integrity?: { reasons?: string[] } & Record<string, unknown>;
  created_at: string;
}

export interface AdminQuestion {
  id: number;
  ext_id: string | null;
  type: string;
  category: string;
  prompt: string;
  correctIndex: number;
  active: boolean;
  puzzleImage: string | null;
  options: TestOption[];
}

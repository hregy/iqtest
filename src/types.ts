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

export interface StartResponse {
  sessionToken: string;
  questions: TestQuestion[];
  settings: { questionSeconds: number };
}

export interface SubmitResult {
  correct: number;
  total: number;
  percent: number;
  byCategory: Record<string, { correct: number; total: number }>;
  durationMs: number;
  practice: boolean;
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

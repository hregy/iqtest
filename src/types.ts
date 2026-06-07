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
  promptFa?: string;
  puzzleImage: string | null;
  options: TestOption[];
}

export interface Integrity {
  blur: number;
  awayMs: number;
  fsExits: number;
  paste: number;
  devtools: boolean;
  // behavioral biometrics (bot detection)
  moves: number; // pointer/touch move events
  downs: number; // taps / pointer-downs
  keys: number; // key presses
  pathPx: number; // cumulative pointer travel
  resizes: number; // window resizes during the test
  multiTab: boolean; // test detected open in another tab
}

export interface QSignal {
  hadInput: boolean; // any pointer/touch/key before this answer
  msToFirst: number; // ms from question shown to first input (-1 if none)
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
  iq: number;
  byCategory: Record<string, { correct: number; total: number }>;
  durationMs: number;
  practice: boolean;
  flagged?: boolean;
  reasons?: string[];
}

export interface ReviewItem {
  index: number;
  prompt: string;
  promptFa?: string;
  category: string;
  puzzleImage: string | null;
  options: TestOption[];
  correctIndex: number | null;
  selectedIndex: number | null;
  correct: boolean;
  timedOut: boolean;
  elapsedMs: number;
}

export interface AnswerResponse {
  done: boolean;
  question?: TestQuestion;
  nonce?: string;
  index?: number;
  total?: number;
  result?: SubmitResult;
  review?: ReviewItem[];
}

export interface BotFlags {
  reasons?: string[];
  suspectedBot?: boolean;
  webdriver?: boolean;
  datacenter?: boolean;
  proxy?: boolean;
}

export interface AttemptRow {
  id: string;
  name: string;
  voucher_code: string | null;
  practice: boolean;
  correct: number;
  total: number;
  status: string;
  created_at: string;
  finished_at: string | null;
  flagged: boolean;
  ip: string | null;
  country: string | null;
  city: string | null;
  isp: string | null;
  is_vpn: boolean;
  browser: string | null;
  os: string | null;
  device: string | null;
  fingerprint: string | null;
  bot_flags: BotFlags | null;
  humanness: number | null;
}

export interface Forensics {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
  isVpn: boolean;
  ua: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
  fingerprint: string | null;
  client: Record<string, unknown> | null;
  botFlags: BotFlags | null;
}

export interface AttemptMatch {
  name: string;
  ip: string | null;
  fingerprint: string | null;
  created_at: string;
}

export interface AttemptReview {
  id: string;
  name: string;
  voucher: string | null;
  practice: boolean;
  correct: number;
  total: number;
  durationMs: number;
  integrity: { reasons?: string[] } & Record<string, unknown>;
  forensics?: Forensics;
  matches?: AttemptMatch[];
  review: ReviewItem[];
}

export interface ScoreRow {
  rank: number;
  name: string;
  correct: number;
  total: number;
  percent: number;
  iq: number | null;
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
  note?: string;
  max_uses?: number;
  uses?: number;
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
  promptFa?: string;
  correctIndex: number;
  active: boolean;
  puzzleImage: string | null;
  options: TestOption[];
}

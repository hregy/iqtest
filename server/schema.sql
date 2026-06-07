-- Image blobs (puzzle + option images) stored in the DB so a single Postgres
-- connection string is all the deployment needs.
CREATE TABLE IF NOT EXISTS images (
  id         SERIAL PRIMARY KEY,
  mime       TEXT NOT NULL,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions (
  id              SERIAL PRIMARY KEY,
  ext_id          TEXT UNIQUE,
  type            TEXT NOT NULL,
  category        TEXT NOT NULL,
  prompt          TEXT NOT NULL DEFAULT '',
  correct_index   INT  NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  active          BOOLEAN NOT NULL DEFAULT true,
  puzzle_image_id INT REFERENCES images(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS question_options (
  id          SERIAL PRIMARY KEY,
  question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  idx         INT NOT NULL CHECK (idx BETWEEN 0 AND 3),
  kind        TEXT NOT NULL DEFAULT 'image',  -- 'image' | 'text'
  text_value  TEXT,
  image_id    INT REFERENCES images(id) ON DELETE SET NULL,
  UNIQUE (question_id, idx)
);

CREATE TABLE IF NOT EXISTS vouchers (
  code       TEXT PRIMARY KEY,
  type       TEXT NOT NULL DEFAULT 'single',  -- 'single' | 'admin'
  used       BOOLEAN NOT NULL DEFAULT false,
  used_by    TEXT,
  used_at    TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scores (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  voucher_code TEXT,
  correct      INT NOT NULL,
  total        INT NOT NULL,
  percent      INT NOT NULL,
  duration_ms  INT,
  excluded     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One recorded score per single-use voucher (prevents double submit).
CREATE UNIQUE INDEX IF NOT EXISTS scores_voucher_unique
  ON scores (voucher_code) WHERE voucher_code IS NOT NULL AND excluded = false;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Server-held state for an in-progress test (enables server-enforced timing,
-- per-question nonces, and integrity tracking that the client can't tamper).
CREATE TABLE IF NOT EXISTS attempts (
  id            TEXT PRIMARY KEY,
  voucher_code  TEXT,
  name          TEXT NOT NULL,
  practice      BOOLEAN NOT NULL DEFAULT false,
  qids          INT[] NOT NULL,
  idx           INT NOT NULL DEFAULT 0,
  current_nonce TEXT,
  served_at     TIMESTAMPTZ,
  correct       INT NOT NULL DEFAULT 0,
  answers       JSONB NOT NULL DEFAULT '[]',
  integrity     JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'active', -- active | done
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

-- True once the client confirms the current question is displayed; lets the
-- server start the per-question clock at display time (fair with slow loads).
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS display_pinged BOOLEAN NOT NULL DEFAULT false;

-- Bilingual: Farsi prompt alongside the English one.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS prompt_fa TEXT NOT NULL DEFAULT '';

-- Integrity columns on scores (added to existing tables too).
ALTER TABLE scores ADD COLUMN IF NOT EXISTS flagged   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS integrity JSONB;

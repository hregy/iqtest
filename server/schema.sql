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

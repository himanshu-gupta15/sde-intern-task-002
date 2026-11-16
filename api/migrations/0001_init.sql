-- Schema for the shared bill splitter.
-- Money is always stored as whole cents (INTEGER). Times are ISO-8601 UTC strings.
-- D1 enforces foreign keys by default.

CREATE TABLE homes (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT homes_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE members (
  id         TEXT PRIMARY KEY,
  home_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  -- 0-based join order inside the home. Decides who gets the leftover cents.
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT members_home_fk FOREIGN KEY (home_id) REFERENCES homes (id) ON DELETE CASCADE,
  -- Two members of one home can never share a join position, even under concurrent inserts.
  CONSTRAINT members_home_position_unique UNIQUE (home_id, position),
  CONSTRAINT members_position_non_negative CHECK (position >= 0),
  CONSTRAINT members_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE bills (
  id          TEXT PRIMARY KEY,
  home_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  CONSTRAINT bills_home_fk FOREIGN KEY (home_id) REFERENCES homes (id) ON DELETE CASCADE,
  -- typeof() guards against SQLite's loose typing storing a REAL like 10.5.
  CONSTRAINT bills_total_positive_integer CHECK (typeof(total_cents) = 'integer' AND total_cents > 0),
  CONSTRAINT bills_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE INDEX bills_home_idx ON bills (home_id, created_at);

CREATE TABLE shares (
  id              TEXT PRIMARY KEY,
  bill_id         TEXT NOT NULL,
  member_id       TEXT NOT NULL,
  amount_cents    INTEGER NOT NULL,
  paid_at         TEXT,
  idempotency_key TEXT,
  CONSTRAINT shares_bill_fk FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE CASCADE,
  CONSTRAINT shares_member_fk FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE,
  -- A member has at most one share per bill.
  CONSTRAINT shares_bill_member_unique UNIQUE (bill_id, member_id),
  CONSTRAINT shares_amount_non_negative_integer
    CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0),
  -- A share is either unpaid (no time, no key) or paid (both set). Never half-paid.
  CONSTRAINT shares_paid_has_key
    CHECK ((paid_at IS NULL AND idempotency_key IS NULL)
        OR (paid_at IS NOT NULL AND idempotency_key IS NOT NULL))
);

CREATE INDEX shares_member_idx ON shares (member_id);

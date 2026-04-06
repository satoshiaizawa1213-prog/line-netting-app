-- LINE Netting App: Initial Schema
-- 実行順: users → groups → group_members → payments → payment_splits → approvals → settlements → settlement_payments → settlement_results

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM
-- ============================================================
CREATE TYPE payment_status  AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE approval_action AS ENUM ('approved', 'rejected');
CREATE TYPE netting_method  AS ENUM ('multilateral', 'bilateral');

-- ============================================================
-- users
-- ============================================================
CREATE TABLE users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id  VARCHAR(64) NOT NULL UNIQUE,
  display_name  VARCHAR(255) NOT NULL,
  picture_url   VARCHAR(512),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- groups
-- ============================================================
CREATE TABLE groups (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  line_group_id VARCHAR(64) NOT NULL UNIQUE,
  name          VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- group_members
-- ============================================================
CREATE TABLE group_members (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  is_active BOOLEAN     NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user  ON group_members(user_id);

-- ============================================================
-- payments（支払い報告）
-- ============================================================
CREATE TABLE payments (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID           NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  reporter_id UUID           NOT NULL REFERENCES users(id),
  payer_id    UUID           NOT NULL REFERENCES users(id),
  amount      INTEGER        NOT NULL CHECK (amount > 0),
  description VARCHAR(255)   NOT NULL,
  status      payment_status NOT NULL DEFAULT 'pending',
  settled     BOOLEAN        NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_group_id ON payments(group_id);
CREATE INDEX idx_payments_status   ON payments(status);
CREATE INDEX idx_payments_settled  ON payments(settled);

-- ============================================================
-- payment_splits（分担内訳）
-- ============================================================
CREATE TABLE payment_splits (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID    NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  user_id    UUID    NOT NULL REFERENCES users(id),
  amount     INTEGER NOT NULL CHECK (amount > 0),
  UNIQUE (payment_id, user_id)
);

CREATE INDEX idx_payment_splits_payment ON payment_splits(payment_id);

-- ============================================================
-- approvals（承認・却下ログ）
-- ============================================================
CREATE TABLE approvals (
  id         UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID            NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  user_id    UUID            NOT NULL REFERENCES users(id),
  action     approval_action NOT NULL,
  comment    TEXT,
  created_at TIMESTAMPTZ     NOT NULL DEFAULT now(),
  UNIQUE (payment_id, user_id)
);

CREATE INDEX idx_approvals_payment ON approvals(payment_id);

-- ============================================================
-- settlements（精算実行記録）
-- ============================================================
CREATE TABLE settlements (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID           NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  method      netting_method NOT NULL,
  executed_by UUID           NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_settlements_group ON settlements(group_id);

-- ============================================================
-- settlement_payments（精算に含まれた支払い）
-- ============================================================
CREATE TABLE settlement_payments (
  settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  payment_id    UUID NOT NULL REFERENCES payments(id),
  PRIMARY KEY (settlement_id, payment_id)
);

-- ============================================================
-- settlement_results（Netting計算結果）
-- ============================================================
CREATE TABLE settlement_results (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID    NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  from_user_id  UUID    NOT NULL REFERENCES users(id),
  to_user_id    UUID    NOT NULL REFERENCES users(id),
  amount        INTEGER NOT NULL CHECK (amount > 0),
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX idx_settlement_results_settlement ON settlement_results(settlement_id);

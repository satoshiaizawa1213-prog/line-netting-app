-- 支払い作成の冪等性キー
ALTER TABLE payments ADD COLUMN idempotency_key VARCHAR(64);
CREATE UNIQUE INDEX idx_payments_idempotency ON payments(group_id, reporter_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- settlement_payments.payment_id に ON DELETE CASCADE を追加
-- グループ削除時に payments と settlement_payments の両方が cascadeされる際、
-- 処理順序によっては FK 制約違反が発生するため修正

ALTER TABLE settlement_payments DROP CONSTRAINT settlement_payments_payment_id_fkey;
ALTER TABLE settlement_payments ADD CONSTRAINT settlement_payments_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE;

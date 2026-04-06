-- settlement_results に支払い完了フラグを追加
ALTER TABLE settlement_results
  ADD COLUMN paid BOOLEAN NOT NULL DEFAULT false;

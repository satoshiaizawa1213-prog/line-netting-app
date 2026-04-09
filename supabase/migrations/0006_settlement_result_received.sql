-- 受取済みフラグを settlement_results に追加
ALTER TABLE settlement_results ADD COLUMN received BOOLEAN NOT NULL DEFAULT false;

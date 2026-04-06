-- group_members に傾斜割の重みを追加（デフォルト1）
ALTER TABLE group_members ADD COLUMN weight NUMERIC(5,2) NOT NULL DEFAULT 1;

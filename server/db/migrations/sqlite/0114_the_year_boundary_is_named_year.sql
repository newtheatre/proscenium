-- The whole-year boundary keys take the word the committee uses (0087): a stored value moves
-- to the new key unchanged, with its editor and time. The audit trail keeps the old key's history.
UPDATE `config` SET `key` = 'YEAR_START' WHERE `key` = 'SEASON_START';
--> statement-breakpoint
UPDATE `config` SET `key` = 'YEAR_END' WHERE `key` = 'SEASON_END';

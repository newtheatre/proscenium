-- The committee's rota override covers every role, so its key no longer says "bar" (0263): a stored
-- night moves to the new key unchanged, with its editor and time. The audit trail keeps the old key's history.
UPDATE `config` SET `key` = 'SHIFT_COMMITTEE_UNTIL' WHERE `key` = 'BAR_SHIFT_COMMITTEE_UNTIL';

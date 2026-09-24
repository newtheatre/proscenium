-- The pairs 0094 missed: the till's ticket lines (F-122, F-123) and the Fellowship award's pass
-- (D-130). Seeded unmapped, as 0094's were; a row already present is left as it is (I-108).
INSERT OR IGNORE INTO su_nominal_mappings (id, kind, source) VALUES
  ('b692f9954e2a4bfab76a4833da00e4df', 'TICKET_COLLECTION', 'TILL'),
  ('a0b9647a509644b7a790b12e5b7ee33c', 'WALK_UP', 'TILL'),
  ('cd2aacafc69a4b559a47faf77b31a791', 'PASS_SALE', 'SYSTEM');

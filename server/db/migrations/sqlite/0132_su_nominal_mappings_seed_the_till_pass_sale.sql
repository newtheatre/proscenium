-- A season pass sold on the till (D-134) posts PASS_SALE under TILL. Seeded unmapped, as 0094's
-- and 0117's were; a row already present is left as it is (I-108).
INSERT OR IGNORE INTO su_nominal_mappings (id, kind, source) VALUES
  ('6148f9ea1ea042378b4400b8b62f8cf6', 'PASS_SALE', 'TILL');

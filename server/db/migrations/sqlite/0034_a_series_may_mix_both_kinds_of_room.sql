-- A term may have weeks in a room we manage and weeks in one we do not (C-124). The occurrence
-- keeps its place in the series whichever kind it is, and the head may be either, so the series
-- names one or the other and never both.

ALTER TABLE external_requests ADD COLUMN series_id TEXT REFERENCES room_series(id);
--> statement-breakpoint
ALTER TABLE external_requests ADD COLUMN occurrence INTEGER;
--> statement-breakpoint
ALTER TABLE room_series ADD COLUMN head_request_id TEXT REFERENCES external_requests(id);
--> statement-breakpoint
CREATE INDEX external_requests_series ON external_requests (series_id);

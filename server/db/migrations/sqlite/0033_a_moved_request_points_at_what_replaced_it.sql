-- A request moved between a room we manage and one we do not is superseded, never deleted: the
-- old row goes to CANCELLED and points at what replaced it (C-123). Neither status set can gain a
-- value, because both carry a CHECK and both tables have cascading dependents, so a rebuild is
-- refused (0010). Added columns need no rebuild.

ALTER TABLE room_bookings ADD COLUMN converted_to_request_id TEXT REFERENCES external_requests(id);
--> statement-breakpoint
ALTER TABLE room_bookings ADD COLUMN converted_from_request_id TEXT REFERENCES external_requests(id);
--> statement-breakpoint
ALTER TABLE external_requests ADD COLUMN converted_to_booking_id TEXT REFERENCES room_bookings(id);
--> statement-breakpoint
ALTER TABLE external_requests ADD COLUMN converted_from_booking_id TEXT REFERENCES room_bookings(id);

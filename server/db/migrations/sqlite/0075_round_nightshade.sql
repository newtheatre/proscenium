CREATE UNIQUE INDEX `ledger_lines_ticket_collection_once` ON `ledger_lines` (`ticket_id`) WHERE kind = 'TICKET_COLLECTION';
--> statement-breakpoint
CREATE TRIGGER ledger_lines_ticket_collection_needs_collected_reservation
BEFORE INSERT ON ledger_lines
WHEN NEW.kind = 'TICKET_COLLECTION'
BEGIN
  SELECT RAISE(ABORT, 'a ticket collection line must reference a collected reservation')
  WHERE NOT EXISTS (
    SELECT 1 FROM tickets t JOIN reservations r ON r.id = t.reservation_id
    WHERE t.id = NEW.ticket_id AND r.status = 'COLLECTED'
  );
END;
-- A pass is paid, or chosen online and owed at the till (0261). Every pass sold before this is paid.
ALTER TABLE `passes` ADD `paid` integer DEFAULT true NOT NULL;
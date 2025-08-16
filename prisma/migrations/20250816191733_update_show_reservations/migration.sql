-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Show" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "showType" TEXT NOT NULL,
    "posterImageUrl" TEXT,
    "programmeUrl" TEXT,
    "ageRating" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Show" ("ageRating", "createdAt", "description", "id", "isActive", "posterImageUrl", "programmeUrl", "showType", "slug", "status", "title", "updatedAt") SELECT "ageRating", "createdAt", "description", "id", "isActive", "posterImageUrl", "programmeUrl", "showType", "slug", "status", "title", "updatedAt" FROM "Show";
DROP TABLE "Show";
ALTER TABLE "new_Show" RENAME TO "Show";
CREATE UNIQUE INDEX "Show_slug_key" ON "Show"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

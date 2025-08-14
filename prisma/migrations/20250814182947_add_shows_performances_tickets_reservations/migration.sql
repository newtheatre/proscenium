-- CreateTable
CREATE TABLE "Performance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "startDateTime" DATETIME NOT NULL,
    "endDateTime" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "maxCapacity" INTEGER NOT NULL,
    "reservationsOpen" BOOLEAN NOT NULL DEFAULT true,
    "reservationInstructions" TEXT,
    "externalBookingLink" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showId" TEXT,
    "venueId" TEXT,
    CONSTRAINT "Performance_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Performance_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reservationCode" TEXT NOT NULL,
    "totalPrice" REAL NOT NULL,
    "reservationDateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING_COLLECTION',
    "notes" TEXT,
    "adminNotes" TEXT,
    "collectionDeadline" DATETIME,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "performanceId" TEXT NOT NULL,
    "userId" TEXT,
    CONSTRAINT "Reservation_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "Performance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReservedTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quantity" INTEGER NOT NULL,
    "pricePerItemAtReservation" REAL NOT NULL,
    "ticketTypeNameAtReservation" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "reservationId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "performanceTicketPriceId" TEXT,
    "showTicketPriceId" TEXT,
    CONSTRAINT "ReservedTicket_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReservedTicket_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReservedTicket_performanceTicketPriceId_fkey" FOREIGN KEY ("performanceTicketPriceId") REFERENCES "PerformanceTicketPrice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReservedTicket_showTicketPriceId_fkey" FOREIGN KEY ("showTicketPriceId") REFERENCES "ShowTicketPrice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Show" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "showType" TEXT NOT NULL,
    "posterImageUrl" TEXT,
    "programmeUrl" TEXT,
    "ageRating" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ContentWarning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ShowContentWarning" (
    "showId" TEXT NOT NULL,
    "contentWarningId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("showId", "contentWarningId"),
    CONSTRAINT "ShowContentWarning_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShowContentWarning_contentWarningId_fkey" FOREIGN KEY ("contentWarningId") REFERENCES "ContentWarning" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShowInduction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "technicalRequirements" TEXT,
    "riskAssessmentCompleted" BOOLEAN NOT NULL DEFAULT false,
    "riskAssessmentLink" TEXT,
    "companyContactName" TEXT,
    "companyContactEmail" TEXT,
    "companyContactPhone" TEXT,
    "inductionNotes" TEXT,
    "inductionCompleted" BOOLEAN NOT NULL DEFAULT false,
    "showId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShowInduction_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultPrice" REAL NOT NULL,
    "sortOrder" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ShowTicketPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "price" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    CONSTRAINT "ShowTicketPrice_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShowTicketPrice_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PerformanceTicketPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "price" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "performanceId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    CONSTRAINT "PerformanceTicketPrice_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "Performance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PerformanceTicketPrice_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_reservationCode_key" ON "Reservation"("reservationCode");

-- CreateIndex
CREATE UNIQUE INDEX "Show_slug_key" ON "Show"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ContentWarning_name_key" ON "ContentWarning"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ShowInduction_showId_key" ON "ShowInduction"("showId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketType_name_key" ON "TicketType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ShowTicketPrice_showId_ticketTypeId_key" ON "ShowTicketPrice"("showId", "ticketTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceTicketPrice_performanceId_ticketTypeId_key" ON "PerformanceTicketPrice"("performanceId", "ticketTypeId");

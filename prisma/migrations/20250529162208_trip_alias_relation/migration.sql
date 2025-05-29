-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "tripMode" TEXT NOT NULL DEFAULT 'normal';

-- CreateTable
CREATE TABLE "TripAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "TripAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripAlias_tripId_alias_key" ON "TripAlias"("tripId", "alias");

-- CreateIndex
CREATE UNIQUE INDEX "TripAlias_tripId_userId_key" ON "TripAlias"("tripId", "userId");

-- AddForeignKey
ALTER TABLE "TripAlias" ADD CONSTRAINT "TripAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripAlias" ADD CONSTRAINT "TripAlias_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

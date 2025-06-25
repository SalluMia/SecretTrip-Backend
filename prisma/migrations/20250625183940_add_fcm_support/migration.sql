-- AlterTable
ALTER TABLE "Album" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "JoinRequest" ADD COLUMN     "message" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "MissionTemplate" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "stripePaymentIntentId" TEXT;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "completedMissions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxMembers" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "totalMissions" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fcmToken" TEXT,
ADD COLUMN     "lastActive" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notificationPreferences" JSONB DEFAULT '{"tripRequests": true, "missionAssignments": true, "tripUpdates": true}';

-- CreateTable
CREATE TABLE "NotificationHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,

    CONSTRAINT "NotificationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationHistory_userId_idx" ON "NotificationHistory"("userId");

-- CreateIndex
CREATE INDEX "NotificationHistory_sentAt_idx" ON "NotificationHistory"("sentAt");

-- CreateIndex
CREATE INDEX "NotificationHistory_type_idx" ON "NotificationHistory"("type");

-- CreateIndex
CREATE INDEX "NotificationHistory_read_idx" ON "NotificationHistory"("read");

-- CreateIndex
CREATE INDEX "AssignedMission_userId_tripId_idx" ON "AssignedMission"("userId", "tripId");

-- CreateIndex
CREATE INDEX "AssignedMission_tripId_completed_idx" ON "AssignedMission"("tripId", "completed");

-- CreateIndex
CREATE INDEX "AssignedMission_completed_idx" ON "AssignedMission"("completed");

-- CreateIndex
CREATE INDEX "AssignedMission_submittedAt_idx" ON "AssignedMission"("submittedAt");

-- CreateIndex
CREATE INDEX "JoinRequest_status_idx" ON "JoinRequest"("status");

-- CreateIndex
CREATE INDEX "JoinRequest_createdAt_idx" ON "JoinRequest"("createdAt");

-- CreateIndex
CREATE INDEX "MissionTemplate_category_idx" ON "MissionTemplate"("category");

-- CreateIndex
CREATE INDEX "MissionTemplate_level_idx" ON "MissionTemplate"("level");

-- CreateIndex
CREATE INDEX "MissionTemplate_isActive_idx" ON "MissionTemplate"("isActive");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_tripId_idx" ON "Payment"("tripId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Trip_code_idx" ON "Trip"("code");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "Trip_startDate_idx" ON "Trip"("startDate");

-- CreateIndex
CREATE INDEX "TripAlias_tripId_alias_idx" ON "TripAlias"("tripId", "alias");

-- CreateIndex
CREATE INDEX "User_fcmToken_idx" ON "User"("fcmToken");

-- CreateIndex
CREATE INDEX "User_lastActive_idx" ON "User"("lastActive");

-- AddForeignKey
ALTER TABLE "NotificationHistory" ADD CONSTRAINT "NotificationHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the column `content` on the `privacy_policies` table. All the data in the column will be lost.
  - You are about to drop the column `language` on the `privacy_policies` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "privacy_policies" DROP COLUMN "content",
DROP COLUMN "language",
ADD COLUMN     "contentEn" TEXT,
ADD COLUMN     "contentFr" TEXT;

/*
  Warnings:

  - A unique constraint covering the columns `[shortId]` on the table `Bundle` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Bundle" ADD COLUMN     "shortId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Bundle_shortId_key" ON "Bundle"("shortId");

/*
  Warnings:

  - A unique constraint covering the columns `[shop,shortId]` on the table `Bundle` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Bundle_shortId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Bundle_shop_shortId_key" ON "Bundle"("shop", "shortId");

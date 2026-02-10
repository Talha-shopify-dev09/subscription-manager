/*
  Warnings:

  - The `type` column on the `Subscription` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `shopifyPlanIds` column on the `Subscription` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `shop` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `plansData` on the `Subscription` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "SubscriptionType" AS ENUM ('PRODUCT', 'COLLECTION');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "shop" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "type",
ADD COLUMN     "type" "SubscriptionType" NOT NULL DEFAULT 'PRODUCT',
DROP COLUMN "plansData",
ADD COLUMN     "plansData" JSONB NOT NULL,
DROP COLUMN "shopifyPlanIds",
ADD COLUMN     "shopifyPlanIds" JSONB;

-- CreateTable
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" TEXT,
    "discount" TEXT,
    "discountCode" TEXT,
    "discountId" TEXT,
    "productIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "nextBillingDate" TIMESTAMP(3),
    "recurringPrice" DECIMAL(65,30),
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "planId" TEXT,
    "bundleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bundle_shop_idx" ON "Bundle"("shop");

-- CreateIndex
CREATE INDEX "Contract_shop_idx" ON "Contract"("shop");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "Transaction_shop_idx" ON "Transaction"("shop");

-- CreateIndex
CREATE INDEX "Transaction_contractId_idx" ON "Transaction"("contractId");

-- CreateIndex
CREATE INDEX "Subscription_shop_idx" ON "Subscription"("shop");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "BundleSale" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "bundleTitle" TEXT NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BundleSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BundleSale_shop_idx" ON "BundleSale"("shop");

-- CreateIndex
CREATE INDEX "BundleSale_orderId_idx" ON "BundleSale"("orderId");

-- CreateIndex
CREATE INDEX "BundleSale_bundleId_idx" ON "BundleSale"("bundleId");

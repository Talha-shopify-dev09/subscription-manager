-- Add orderId to Transaction for idempotency
ALTER TABLE "Transaction" ADD COLUMN "orderId" TEXT;

-- Ensure only one transaction per shop + orderId
CREATE UNIQUE INDEX "Transaction_shop_orderId_key" ON "Transaction"("shop", "orderId");

-- Prevent duplicate bundle sales per order/bundle/shop
CREATE UNIQUE INDEX "BundleSale_shop_orderId_bundleId_key" ON "BundleSale"("shop", "orderId", "bundleId");

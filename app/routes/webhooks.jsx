import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  // 1. Authenticate the webhook request
  // We include 'admin' here to allow GraphQL queries inside the webhook logic
  const { topic, shop, payload, session, admin } = await authenticate.webhook(request);

  console.log(`Received Webhook: ${topic} for shop ${shop}`);

  switch (topic) {
    // --- 2. HANDLE NEW SUBSCRIPTION CONTRACTS ---
    case "SUBSCRIPTION_CONTRACTS_CREATE": {
      const { id, status, nextBillingDate, customer, currencyCode, lines } = payload;
      const contractId = String(id);
      
      const productGid = lines?.[0]?.productId; 
      const recurringPrice = payload.lines?.[0]?.pricingPolicy?.price?.amount;

      try {
        let localPlan = await db.subscription.findFirst({
          where: { targetId: productGid, shop: shop }
        });

        if (!localPlan && admin && productGid) {
          console.log(`🔍 No direct product plan. Checking collections for: ${productGid}`);
          
          const response = await admin.graphql(
            `#graphql
            query getProductCollections($id: ID!) {
              product(id: $id) {
                collections(first: 10) {
                  nodes { id }
                }
              }
            }`, 
            { variables: { id: productGid } }
          );

          const collectionData = await response.json();
          const collectionIds = collectionData.data?.product?.collections?.nodes.map(c => c.id) || [];

          if (collectionIds.length > 0) {
            localPlan = await db.subscription.findFirst({
              where: { 
                shop: shop,
                targetId: { in: collectionIds },
                type: 'COLLECTION'
              }
            });
          }
        }

        await db.contract.upsert({
          where: { id: contractId },
          update: {
            status: status.toUpperCase(), 
            nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
            recurringPrice: recurringPrice,
          },
          create: {
            id: contractId,
            shop: shop,
            customerId: customer?.id,
            customerName: `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim(),
            customerEmail: customer?.email,
            status: status.toUpperCase(),
            nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
            recurringPrice: recurringPrice,
            currencyCode: currencyCode || "USD",
            planId: localPlan?.id,
          },
        });

        console.log(`✅ Saved Contract ${contractId} (Linked Plan: ${localPlan ? localPlan.targetTitle : 'None'})`);
      } catch (error) {
        console.error("❌ Error saving contract:", error);
      }
      break;
    }

    // --- 3. HANDLE SUBSCRIPTION UPDATES ---
    case "SUBSCRIPTION_CONTRACTS_UPDATE": {
      const { id, status, nextBillingDate } = payload;
      const contractId = String(id);
      const recurringPrice = payload.lines?.[0]?.pricingPolicy?.price?.amount;
      try {
        await db.contract.update({
          where: { id: contractId },
          data: {
            status: status.toUpperCase(),
            nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
            recurringPrice: recurringPrice,
          },
        });
        console.log(`🔄 Updated Contract ${id} to ${status}`);
      } catch (error) {
        console.error("❌ Error updating contract:", error);
      }
      break;
    }

    // --- 4. HANDLE SUCCESSFUL BILLING ATTEMPTS ---
    case "SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS": {
      const { subscriptionContractId, completedOrder } = payload;
      if (!subscriptionContractId || !completedOrder) {
        console.warn("Received SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS with missing data.");
        break;
      }
      
      const amount = completedOrder.totalPriceSet.shopMoney.amount;
      const currency = completedOrder.totalPriceSet.shopMoney.currencyCode;

      try {
        await db.transaction.create({
          data: {
            shop: shop,
            contractId: String(subscriptionContractId),
            amount: parseFloat(amount),
            currencyCode: currency
          }
        });
        console.log(`💰 Recorded transaction of ${amount} ${currency} for contract ${subscriptionContractId}`);
      } catch (error) {
        console.error("❌ Error recording transaction:", error);

        if (error.code === 'P2003') { // Foreign key constraint failed
          console.error(`  Contract with ID ${subscriptionContractId} not found in the database. A contract must exist before a transaction can be recorded.`);
        }
      }
      break;
    }

    // --- 5. APP UNINSTALL CLEANUP ---
    case "APP_UNINSTALLED": {
      if (session) {
        // Clean up all shop data to comply with Shopify requirements
        await db.session.deleteMany({ where: { shop } });
        await db.subscription.deleteMany({ where: { shop } });
        await db.bundle.deleteMany({ where: { shop } });
        await db.contract.deleteMany({ where: { shop } });
        console.log(`🗑️ Cleaned up data for uninstalled shop: ${shop}`);
      }
      break;
    }

    default:
      console.warn(`Unhandled webhook topic: ${topic}`);
      break;
  }

  // Always return a 200 OK Response to satisfy Shopify's delivery check
  return new Response();
};
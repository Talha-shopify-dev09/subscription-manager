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
      
      // Webhooks provide 'lines' as a direct array
      const productGid = lines?.[0]?.productId; 

      try {
        // A. Try to find a direct Product Subscription match
        let localPlan = await db.subscription.findFirst({
          where: { targetId: productGid, shop: shop }
        });

        // B. IMPROVEMENT: If no direct product plan, check for Collection-based plans
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

        // C. Save or Update the contract in your database
        await db.contract.upsert({
          where: { id: id },
          update: {
            status: status.toUpperCase(), 
            nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
          },
          create: {
            id: id,
            shop: shop,
            customerId: customer?.id,
            customerName: `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim(),
            customerEmail: customer?.email,
            status: status.toUpperCase(),
            nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
            currencyCode: currencyCode || "USD",
            planId: localPlan?.id, // Successfully links to Product OR Collection plans
          },
        });

        console.log(`✅ Saved Contract ${id} (Linked Plan: ${localPlan ? localPlan.targetTitle : 'None'})`);
      } catch (error) {
        console.error("❌ Error saving contract:", error);
      }
      break;
    }

    // --- 3. HANDLE SUBSCRIPTION UPDATES ---
    case "SUBSCRIPTION_CONTRACTS_UPDATE": {
      const { id, status, nextBillingDate } = payload;
      try {
        await db.contract.update({
          where: { id: id },
          data: {
            status: status.toUpperCase(),
            nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
          },
        });
        console.log(`🔄 Updated Contract ${id} to ${status}`);
      } catch (error) {
        console.error("❌ Error updating contract:", error);
      }
      break;
    }

    // --- 4. APP UNINSTALL CLEANUP ---
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
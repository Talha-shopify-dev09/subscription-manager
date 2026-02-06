import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  // 1. Authenticate the webhook request
  const { topic, shop, payload, session } = await authenticate.webhook(request);

  console.log(`Received Webhook: ${topic} for shop ${shop}`);

  switch (topic) {
    // --- 2. HANDLE NEW SUBSCRIPTION CONTRACTS ---
    case "SUBSCRIPTION_CONTRACTS_CREATE": {
      const { id, status, nextBillingDate, customer, currencyCode, lines } = payload;
      
      // FIX: Webhooks provide 'lines' as a direct array
      // We get the Product GID to link the contract to your local subscription plan
      const productGid = lines?.[0]?.productId; 

      try {
        // Find your local plan ID based on the Product GID and Shop
        const localPlan = await db.subscription.findFirst({
          where: { targetId: productGid, shop: shop }
        });

        await db.contract.upsert({
          where: { id: id },
          update: {
            // Convert status to uppercase (e.g., 'active' -> 'ACTIVE') to match Prisma Enum
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
            planId: localPlan?.id, // Linking the contract to the plan for the dashboard
          },
        });
        console.log(`✅ Saved Contract ${id} for ${shop} (Linked to Plan: ${localPlan?.id || 'None'})`);
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
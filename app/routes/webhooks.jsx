import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, session, payload } = await authenticate.webhook(request);

  console.log(`Received Webhook: ${topic} for shop ${shop}`);

  switch (topic) {
    // 1. HANDLE NEW SUBSCRIPTIONS
    case "SUBSCRIPTION_CONTRACTS_CREATE": {
      const { id, status, nextBillingDate, customer, currencyCode } = payload;

      try {
        await db.contract.upsert({
          where: { id: id },
          update: {
            status: status,
            nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
          },
          create: {
            id: id,
            shop: shop,
            customerId: customer?.id,
            customerName: `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim(),
            customerEmail: customer?.email,
            status: status,
            nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
            currencyCode: currencyCode || "USD",
          },
        });
        console.log(`✅ Saved Contract ${id} for ${shop}`);
      } catch (error) {
        console.error("❌ Error saving contract:", error);
      }
      break;
    }

    // 2. HANDLE UPDATES (Pause/Resume/Cancel)
    case "SUBSCRIPTION_CONTRACTS_UPDATE": {
      const { id, status, nextBillingDate } = payload;
      try {
        await db.contract.update({
          where: { id: id },
          data: {
            status: status,
            nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
          },
        });
        console.log(`🔄 Updated Contract ${id} to ${status}`);
      } catch (error) {
        console.error("❌ Error updating contract:", error);
      }
      break;
    }

    // 3. APP UNINSTALL CLEANUP
    case "APP_UNINSTALLED": {
      if (session) {
        await db.session.deleteMany({ where: { shop } });
        // Optional: Keep subscription plans data or delete it
        await db.subscription.deleteMany({ where: { shop } });
        await db.bundle.deleteMany({ where: { shop } });
        await db.contract.deleteMany({ where: { shop } });
      }
      break;
    }

    // 4. GDPR COMPLIANCE
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
      console.log(`GDPR Request for ${shop}:`, payload);
      break;

    default:
      console.warn(`Unhandled webhook topic: ${topic}`);
      break;
  }

  // Always return a 200 OK Response
  return new Response();
};
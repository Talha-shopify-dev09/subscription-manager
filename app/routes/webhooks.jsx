import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  // 1. Extract 'admin' from the webhook authentication to perform the tagging
  const { topic, shop, session, payload, admin } = await authenticate.webhook(request);

  console.log(`Received Webhook: ${topic} for shop ${shop}`);

  switch (topic) {
    // --- 1. HANDLE AUTOMATIC ORDER TAGGING ---
    case "ORDERS_CREATE": {
      const orderId = payload.admin_graphql_api_id; // Format: gid://shopify/Order/XXXXX
      const shortId = payload.id; // Numeric ID for unique tag creation

      // Identify Subscriptions by looking for a Selling Plan ID
      const isSubscription = payload.line_items.some(item => item.selling_plan_id);
      
      // Identify Bundles by looking for a custom property (e.g., _bundle_id)
      const isBundle = payload.line_items.some(item => 
        item.properties?.some(p => p.name === "_bundle_id" || p.name === "Bundle ID")
      );

      let tagToApply = "";
      if (isSubscription) {
        tagToApply = `Subscription-${shortId}`; // e.g., Subscription-6680123
      } else if (isBundle) {
        tagToApply = `Bundle-${shortId}`; // e.g., Bundle-6680123
      }

      // Execute the Admin API mutation to apply the tag if conditions are met
      if (tagToApply && admin) {
        try {
          await admin.graphql(
            `#graphql
            mutation addOrderTag($id: ID!, $tags: [String!]!) {
              tagsAdd(id: $id, tags: $tags) {
                node { id }
                userErrors { field message }
              }
            }`,
            {
              variables: {
                id: orderId,
                tags: [tagToApply]
              }
            }
          );
          console.log(`✅ Tagged Order ${shortId} as ${tagToApply}`);
        } catch (error) {
          console.error(`❌ Tagging failed for Order ${shortId}:`, error);
        }
      }
      break;
    }

    // --- 2. HANDLE NEW SUBSCRIPTIONS (DATABASE) ---
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

    // --- 3. HANDLE SUBSCRIPTION UPDATES ---
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

    // --- 4. APP UNINSTALL CLEANUP ---
    case "APP_UNINSTALLED": {
      if (session) {
        await db.session.deleteMany({ where: { shop } });
        await db.subscription.deleteMany({ where: { shop } });
        await db.bundle.deleteMany({ where: { shop } });
        await db.contract.deleteMany({ where: { shop } });
      }
      break;
    }

    // --- 5. GDPR COMPLIANCE ---
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
      console.log(`GDPR Request for ${shop}:`, payload);
      break;

    default:
      console.warn(`Unhandled webhook topic: ${topic}`);
      break;
  }

  // Always return a 200 OK Response to satisfy Shopify
  return new Response();
};
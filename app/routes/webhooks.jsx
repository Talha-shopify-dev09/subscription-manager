import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  // authenticate.webhook verifies HMAC and throws 401 on invalid signatures
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  console.log(`Received Webhook: ${topic} for shop ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT": {
      // GDPR webhooks normally won't have an active admin/session; that's fine.
      console.log(`GDPR Request for ${shop}:`, payload);
      // TODO: comply with the request:
      // - For DATA_REQUEST: prepare data for merchant to supply to customer
      // - For REDACT: delete/anonymize data for that shop/customer in your DB
      break;
    }

    case "APP_UNINSTALLED": {
      // Clean up database when app is uninstalled
      if (session) {
        await db.session.deleteMany({ where: { shop } });
        await db.subscription.deleteMany({ where: { shop } });
      }
      break;
    }

    default: {
      // Optional: log or treat as unhandled
      // console.warn(`Unhandled webhook topic: ${topic}`);
      break;
    }
  }

  // Always return 2xx for valid, verified webhooks
  return new Response();
};
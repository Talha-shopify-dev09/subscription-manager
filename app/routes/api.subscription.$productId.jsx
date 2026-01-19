import { json } from "@react-router/node"; 
import { authenticate } from "../shopify.server";
import db from "../db.server"; // Import DB directly to be safe

export async function loader({ request, params }) {
  // 1. Authenticate (Allow App Proxy)
  await authenticate.public.appProxy(request);

  // 2. Get the raw ID (e.g., "839405823")
  const rawId = params.productId;

  if (!rawId) {
    return json({ error: "Product ID required" }, { status: 400 });
  }

  // 3. Convert to Shopify GID format
  // Your database stores "gid://shopify/Product/..." but the URL only has numbers
  const targetId = `gid://shopify/Product/${rawId}`;

  // 4. Query the Database
  const subscription = await db.subscription.findFirst({
    where: {
      targetId: targetId
    }
  });

  // 5. Return the result
  return json({ 
    subscription: subscription || null 
  });
}
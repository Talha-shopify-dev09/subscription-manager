import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request, params }) {
  // 1. Authenticate (Allow App Proxy)
  await authenticate.public.appProxy(request);

  // 2. Get the raw ID
  const rawId = params.productId;

  if (!rawId) {
    // FIX: Use standard Response.json instead of importing 'json'
    return Response.json({ error: "Product ID required" }, { status: 400 });
  }

  // 3. Convert to Shopify GID format
  const targetId = `gid://shopify/Product/${rawId}`;

  // 4. Query the Database
  const subscription = await db.subscription.findFirst({
    where: {
      targetId: targetId
    }
  });

  // 5. Return the result
  // React Router v7 loves standard Response objects
  return Response.json({ 
    subscription: subscription || null 
  });
}
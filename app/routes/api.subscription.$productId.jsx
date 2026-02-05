import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request, params }) {
  // 1. Authenticate (This extracts the session/shop context)
  const { session } = await authenticate.public.appProxy(request);

  const rawId = params.productId;
  if (!rawId) {
    return Response.json({ error: "Product ID required" }, { status: 400 });
  }

  const targetId = `gid://shopify/Product/${rawId}`;

  // 2. Query the Database (Scoped to the current shop for security)
  const subscription = await db.subscription.findFirst({
    where: {
      shop: session.shop, // Security: Ensure we only show plans for THIS shop
      targetId: targetId
    }
  });

  // 3. Return the result
  return Response.json({ 
    subscription: subscription || null 
  });
}
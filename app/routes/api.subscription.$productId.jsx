import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getBillingInfoWithAdmin, canUseFeature } from "../helpers/billing.server";

export async function loader({ request, params }) {
  try {
    // 1. Authenticate (This extracts the session/shop context)
    const { session, admin } = await authenticate.public.appProxy(request);
    const billing = await getBillingInfoWithAdmin({ admin, shop: session.shop });
    if (!canUseFeature(billing, "SUBSCRIPTION")) {
      return Response.json({ subscription: null });
    }

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
  } catch (error) {
    if (error instanceof Response) {
      // Forward the response from the authentication middleware
      return error;
    }
    // For other unexpected errors, return a generic 500 status
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

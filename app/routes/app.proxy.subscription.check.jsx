import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getBillingInfoWithAdmin, canUseFeature } from "../helpers/billing.server";

export async function loader({ request }) {
  // 1. SECURE: Authenticate the request
  // This verifies the request came from your Storefront (using the HMAC signature)
  // 'admin' allows us to query Shopify to check collections
  const { admin, session } = await authenticate.public.appProxy(request);
  const billing = await getBillingInfoWithAdmin({ admin, shop: session.shop });
  if (!canUseFeature(billing, "SUBSCRIPTION")) {
    return Response.json({ subscription: null });
  }

  const url = new URL(request.url);
  const rawId = url.searchParams.get('productId');
  
  if (!rawId) {
    return Response.json({ error: 'Product ID required' }, { status: 400 });
  }

  // Ensure we are working with a proper Shopify GID
  const targetId = rawId.startsWith('gid://') ? rawId : `gid://shopify/Product/${rawId}`;

  try {
    // 2. Strategy A: Check for a Direct Product Subscription first
    let subscription = await db.subscription.findFirst({
      where: {
        shop: session.shop,
        targetId: targetId,
        enabled: true
      }
    });

    // 3. Strategy B: Check for Collection Subscription (if no product plan found)
    // We use the admin API to find which collections this product belongs to
    if (!subscription && admin) {
      const response = await admin.graphql(
        `#graphql
        query getProductCollections($id: ID!) {
          product(id: $id) {
            collections(first: 10) {
              nodes { id }
            }
          }
        }`,
        { variables: { id: targetId } }
      );

      const json = await response.json();
      const collectionIds = json.data?.product?.collections?.nodes.map(c => c.id) || [];

      if (collectionIds.length > 0) {
        // Look for any enabled subscription that targets these collections
        subscription = await db.subscription.findFirst({
          where: {
            shop: session.shop,
            targetId: { in: collectionIds },
            type: 'COLLECTION',
            enabled: true
          }
        });
      }
    }

    // 4. Return the result
    // Note: 'authenticate.public.appProxy' handles CORS automatically for Shopify proxies
    return Response.json({ 
      subscription: subscription || null 
    });

  } catch (error) {
    console.error("❌ Proxy Loader Error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

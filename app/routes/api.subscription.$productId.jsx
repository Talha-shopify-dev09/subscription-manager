import { authenticate } from "../shopify.server";
import { getSubscriptionByProductId } from "../models/subscriptions.server";

export async function loader({ request, params }) {
  // 1. Authenticate the request
  // This validates that the request is coming from your Storefront Proxy
  await authenticate.public.appProxy(request);

  // 2. Get the ID correctly
  // We use 'productId' because the filename is api.subscription.$productId.jsx
  const productId = params.productId;

  if (!productId) {
    return new Response(JSON.stringify({ error: "Product ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 3. Get the subscription from your Database
  const subscription = await getSubscriptionByProductId(productId);

  // 4. Return the data as JSON
  return new Response(JSON.stringify({ 
    subscription: subscription || null 
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
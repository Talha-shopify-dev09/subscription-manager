import { authenticate } from "../shopify.server";
import { getSubscriptionByProductId } from "../models/subscriptions.server";

export async function loader({ request, params }) {
  // 1. Authenticate the request
  // This validates that the request is coming from your Storefront Proxy
  const { session } = await authenticate.public.appProxy(request);

  const productId = params.id;

  if (!productId) {
    return new Response(JSON.stringify({ error: "Product ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 2. Get the subscription from your Database (or Memory)
  const subscription = await getSubscriptionByProductId(productId);

  // 3. Return the data as JSON
  return new Response(JSON.stringify({ 
    subscription: subscription || null 
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
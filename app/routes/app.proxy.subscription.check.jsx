import { getSubscriptionByProduct } from "../models/subscriptions.server";

export async function loader({ request }) {
  // This endpoint is called from the storefront
  const url = new URL(request.url);
  const productId = url.searchParams.get('productId');
  
  if (!productId) {
    return new Response(JSON.stringify({ error: 'Product ID required' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  // Find subscription for this product
  const subscription = getSubscriptionByProduct(productId);
  
  return new Response(JSON.stringify({ 
    subscription: subscription || null 
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
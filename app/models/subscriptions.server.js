// Temporary in-memory storage
// (Data will reset when you restart the server)
let subscriptions = [];

export function getAllSubscriptions() {
  return subscriptions;
}

export function getSubscriptionById(id) {
  return subscriptions.find(sub => sub.id === id);
}

// --- NEW HELPER FUNCTION FOR API ---
export function getSubscriptionByProduct(productId) {
  // 1. Clean the ID (remove 'gid://shopify/Product/')
  const numericId = productId.replace('gid://shopify/Product/', '');
  
  // 2. Find the subscription in the array
  // We check if the stored targetId matches either the full GID or just the number
  return subscriptions.find(sub => {
    if (!sub.enabled) return false;

    // Check direct product match
    if (sub.type === 'product') {
      return sub.targetId === numericId || sub.targetId === `gid://shopify/Product/${numericId}`;
    }

    // Note: Collection matching is harder in-memory without fetching API data first.
    // For now, this only reliably finds 'Single Product' subscriptions.
    return false;
  });
}
// -----------------------------------

export function getSubscriptionByCollection(collectionId) {
  return subscriptions.find(sub => 
    sub.type === 'collection' && sub.targetId === collectionId && sub.enabled
  );
}

export async function createSubscription(data) {
  const newSubscription = {
    id: `sub_${Date.now()}`,
    ...data,
    enabled: true,
    createdAt: new Date().toISOString()
  };
  subscriptions.push(newSubscription);
  return newSubscription;
}

export async function updateSubscription(id, data) {
  const index = subscriptions.findIndex(sub => sub.id === id);
  if (index !== -1) {
    subscriptions[index] = { ...subscriptions[index], ...data };
    return subscriptions[index];
  }
  return null;
}

export async function deleteSubscription(id) {
  const index = subscriptions.findIndex(sub => sub.id === id);
  if (index !== -1) {
    subscriptions.splice(index, 1);
    return true;
  }
  return false;
}

export async function toggleSubscription(id) {
  const subscription = subscriptions.find(sub => sub.id === id);
  if (subscription) {
    subscription.enabled = !subscription.enabled;
    return subscription;
  }
  return null;
}

// Map the specific function name expected by the API route to the one we defined
export const getSubscriptionByProductId = getSubscriptionByProduct;
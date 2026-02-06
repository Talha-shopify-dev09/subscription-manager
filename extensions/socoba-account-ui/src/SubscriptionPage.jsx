import {
  reactExtension,
  useApi,
  BlockStack,
  Text,
  Heading,
  Card,
  Spinner,
  Divider,
} from '@shopify/ui-extensions-react/customer-account';
import { useEffect, useState } from 'react';

export default reactExtension(
  'customer-account.page.render',
  () => <SubscriptionPage />,
);

function SubscriptionPage() {
  const { query } = useApi();
  const [appOrders, setAppOrders] = useState([]); // Removed type annotation
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. First, fetch orders to check history
    query(`
      query {
        customer {
          orders(first: 20) {
            nodes {
              id
              name
              lineItems(first: 10) {
                nodes {
                  title
                  sellingPlanId
                  customAttributes {
                    key
                    value
                  }
                }
              }
            }
          }
        }
      }
    `)
    .then((result) => {
  /** @type {any} */
  const data = result.data;
  
  // Define allOrders here by reaching into the customer object
  const allOrders = data?.customer?.orders?.nodes || [];

  // Now you can use allOrders for your filtering logic
  const filtered = allOrders.filter((order) => {
    return order.lineItems.nodes.some((item) => {
      // 1. Check for subscription plans
      const isAppSubscription = item.sellingPlanId !== null;
      
      // 2. Check for bundle attributes
      const isAppBundle = item.customAttributes?.some(
        (attr) => attr.key === "_bundle_id"
      );

      return isAppSubscription || isAppBundle;
    });
  });

  setAppOrders(filtered);
  setLoading(false);
})
    .catch((err) => {
      console.error("API Error:", err);
      setLoading(false);
    });
  }, [query]);

  if (loading) {
    return (
      <BlockStack inlineAlignment="center" padding="extraLoose">
        <Spinner />
      </BlockStack>
    );
  }

  return (
    <BlockStack spacing="loose">
      <Heading>Your App Subscriptions</Heading>
      <Divider />

      {appOrders.length === 0 ? (
        <Card padding>
          <Text>No active subscriptions found from this app.</Text>
        </Card>
      ) : (
        appOrders.map((order) => (
          <Card key={order.id} padding>
            <BlockStack spacing="tight">
              <Text emphasis="bold">Order {order.name}</Text>
              {order.lineItems.nodes.map((item, i) => (
                <Text key={i}>
                  {item.title} {item.sellingPlanId ? "(Subscription)" : "(Bundle)"}
                </Text>
              ))}
            </BlockStack>
          </Card>
        ))
      )}
    </BlockStack>
  );
}
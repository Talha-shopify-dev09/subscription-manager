import {
  reactExtension,
  useApi,
  BlockStack,
  Text,
  Heading,
  Card,
  Spinner,
  Divider,
  Button,
} from '@shopify/ui-extensions-react/customer-account';
import { useEffect, useState } from 'react';

export default reactExtension(
  'customer-account.page.render',
  () => <SubscriptionPage />,
);

function SubscriptionPage() {
  const { query } = useApi();
  const [contracts, setContracts] = useState([]);
  const [hasTaggedOrder, setHasTaggedOrder] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetching contracts AND order tags to verify the subscription
    query(`
      query {
        customer {
          subscriptionContracts(first: 10) {
            nodes {
              id
              status
              nextBillingDate
              lines(first: 1) {
                nodes {
                  title
                }
              }
            }
          }
          orders(first: 10) {
            nodes {
              tags
            }
          }
        }
      }
    `)
    .then((result) => {
      /** @type {any} */
      const data = result.data;
      const fetchedContracts = data?.customer?.subscriptionContracts?.nodes || [];
      const fetchedOrders = data?.customer?.orders?.nodes || [];

      // Check if any order has our custom app tag
      const foundTag = fetchedOrders.some(order => 
        order.tags.some(tag => tag.startsWith("Subscription-"))
      );

      setContracts(fetchedContracts);
      setHasTaggedOrder(foundTag);
      setLoading(false);
    })
    .catch((err) => {
      console.error("Storefront API Error:", err);
      setLoading(false);
    });
  }, [query]);

  if (loading) {
    return (
      <BlockStack inlineAlignment="center" padding="extraLoose">
        <Spinner />
        <Text>Verifying your subscription status...</Text>
      </BlockStack>
    );
  }

  // Logic: Show content if we have a contract OR a tagged order
  const isSubscriber = contracts.length > 0 || hasTaggedOrder;

  return (
    <BlockStack spacing="loose">
      <Heading>Manage Subscriptions</Heading>
      <Divider />

      {!isSubscriber ? (
        <Card padding>
          <Text>You don't have any active subscriptions at this time.</Text>
        </Card>
      ) : (
        <>
          {/* If we have a tagged order but no contract node yet, show a status message */}
          {contracts.length === 0 && hasTaggedOrder && (
            <Card padding>
              <Text emphasis="bold">Your subscription is being activated.</Text>
              <Text size="small">We've identified your order. Your management options will appear here shortly.</Text>
            </Card>
          )}

          {contracts.map((contract) => (
            <Card key={contract.id} padding>
              <BlockStack spacing="tight">
                <Text size="large" emphasis="bold">
                  {contract.lines.nodes[0]?.title || "Subscription Bundle"}
                </Text>
                
                <BlockStack spacing="none">
                  <Text>Status: {contract.status}</Text>
                  <Text>
                    Next Delivery: {contract.nextBillingDate ? new Date(contract.nextBillingDate).toLocaleDateString() : "N/A"}
                  </Text>
                </BlockStack>

                {contract.status === 'ACTIVE' && (
                  <Button 
                    kind="secondary" 
                    onPress={() => console.log("Cancel requested for:", contract.id)}
                  >
                    Cancel Subscription
                  </Button>
                )}
              </BlockStack>
            </Card>
          ))}
        </>
      )}
    </BlockStack>
  );
}
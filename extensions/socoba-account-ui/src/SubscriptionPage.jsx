import {
  reactExtension,
  useApi,
  BlockStack,
  InlineStack, // Added to fix ts(2304)
  Text,
  Heading,
  Card,
  Spinner,
  Divider,
  Badge,
} from '@shopify/ui-extensions-react/customer-account';
import { useEffect, useState } from 'react';

export default reactExtension(
  'customer-account.page.render',
  () => <SubscriptionPage />,
);

function SubscriptionPage() {
  const { query } = useApi();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    query(`
      query {
        customer {
          subscriptionContracts(first: 10) {
            nodes {
              id
              status
              nextBillingDate
              lines(first: 5) {
                nodes {
                  title
                  quantity
                }
              }
            }
          }
        }
      }
    `)
   .then((result) => {
  // We use it once here to grab everything inside it
  const customerData = result?.data?.customer;

  // Now you never have to type 'customer' again for the rest of this function
  const fetchedNodes = customerData?.subscriptionContracts?.nodes || [];
  
  setContracts(fetchedNodes);
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
        <Text>Loading your subscriptions...</Text>
      </BlockStack>
    );
  }

  return (
    <BlockStack spacing="loose">
      <Heading>Manage Subscriptions</Heading>
      <Divider />

      {contracts.length === 0 ? (
        <Card padding>
          <Text>You don't have any active subscriptions at this time.</Text>
        </Card>
      ) : (
        contracts.map((contract) => (
          <Card key={contract.id} padding>
            <BlockStack spacing="tight">
              <Text size="large" emphasis="bold">
                {contract.lines.nodes[0]?.title || "Subscription Plan"}
              </Text>
              
              <BlockStack spacing="none">
                {/* Fixed inlineAlignment to valid value 'start' */}
                <InlineStack blockAlignment="center" inlineAlignment="start">
                  <Text>Status: </Text>
                  {/* Badge tone must be a literal: 'info', 'success', 'warning', or 'critical' */}
                  <Badge tone={contract.status === 'ACTIVE' ? 'default' : 'subdued'}>
  {contract.status}
</Badge>
                </InlineStack>
                
                {/* Changed 'color' to 'appearance' to fix ts(2322) */}
                <Text appearance="subdued">
                  Next Billing: {contract.nextBillingDate ? new Date(contract.nextBillingDate).toLocaleDateString() : "N/A"}
                </Text>
              </BlockStack>

              <Divider />
              
              <Text size="small" appearance="subdued">
                Contract ID: {contract.id.split('/').pop()}
              </Text>
            </BlockStack>
          </Card>
        ))
      )}
    </BlockStack>
  );
}
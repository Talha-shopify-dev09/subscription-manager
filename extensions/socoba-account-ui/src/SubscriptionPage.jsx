import {
  reactExtension,
  useApi,
  BlockStack,
  InlineStack,
  Text,
  Heading,
  Card,
  Spinner,
  Divider,
  Badge,
  Button, // Import Button
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

  // This is the bridge to your App Proxy (where the Cancel logic lives)
  const PORTAL_URL = "/apps/subscription-manager/portal";

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
      const customerData = result?.data?.customer;
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
            <BlockStack spacing="loose">
              <InlineStack inlineAlignment="space-between" blockAlignment="center">
                 <BlockStack spacing="extraTight">
                    <Text size="large" emphasis="bold">
                      {contract.lines.nodes[0]?.title || "Subscription Plan"}
                    </Text>
                    <InlineStack spacing="tight">
                       <Text appearance="subdued">Status:</Text>
                       {/* Using 'success' if allowed, falling back to 'default' if strict */}
                       <Badge tone={contract.status === 'ACTIVE' ? 'success' : 'subdued'}>
                          {contract.status}
                       </Badge>
                    </InlineStack>
                 </BlockStack>

                 {/* --- CRITICAL ADDITION: The Manage Button --- */}
                 {/* This button takes the user to your App Proxy Portal to cancel/edit */}
                 <Button kind="secondary" to={PORTAL_URL}>
                    Manage
                 </Button>
              </InlineStack>

              <BlockStack spacing="none">
                <Text appearance="subdued">
                  Next Billing: {contract.nextBillingDate ? new Date(contract.nextBillingDate).toLocaleDateString() : "N/A"}
                </Text>
                <Text size="small" appearance="subdued">
                   Contract ID: {contract.id.split('/').pop()}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        ))
      )}
    </BlockStack>
  );
}
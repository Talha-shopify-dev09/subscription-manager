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
  useI18n // Import useI18n
} from '@shopify/ui-extensions-react/customer-account';
import { useEffect, useState } from 'react';

export default reactExtension(
  'customer-account.page.render',
  () => <SubscriptionPage />,
);

function SubscriptionPage() {
  const { query } = useApi(); // No i18n here
  const i18n = useI18n(); // Get i18n correctly
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
      console.log("Storefront API Query Result:", JSON.stringify(result, null, 2));
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
        <Text>{i18n.translate('loading')}</Text>
      </BlockStack>
    );
  }

  return (
    <BlockStack spacing="loose">
      <Heading>{i18n.translate('title')}</Heading>
      <Divider />

      {contracts.length === 0 ? (
        <Card padding>
          <Text>{i18n.translate('no_subscriptions')}</Text>
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
                       <Text appearance="subdued">{i18n.translate('status')}</Text>
                       {/* Using 'success' if allowed, falling back to 'default' if strict */}
                       <Badge tone={contract.status === 'ACTIVE' ? 'success' : 'subdued'}>
                          {contract.status}
                       </Badge>
                    </InlineStack>
                 </BlockStack>

                 {/* --- CRITICAL ADDITION: The Manage Button --- */}
                 {/* This button takes the user to your App Proxy Portal to cancel/edit */}
                 <Button kind="secondary" to={PORTAL_URL}>
                    {i18n.translate('manage')}
                 </Button>
              </InlineStack>

              <BlockStack spacing="none">
                <Text appearance="subdued">
                  {i18n.translate('next_billing')} {contract.nextBillingDate ? new Date(contract.nextBillingDate).toLocaleDateString() : "N/A"}
                </Text>
                <Text size="small" appearance="subdued">
                   {i18n.translate('contract_id')} {contract.id.split('/').pop()}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        ))
      )}
    </BlockStack>
  );
}
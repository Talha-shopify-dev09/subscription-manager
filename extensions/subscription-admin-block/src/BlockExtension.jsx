import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  Text,
  Badge,
  InlineStack,
  Button,
  Divider,
  ProgressIndicator,
  useI18n // Import useI18n
} from '@shopify/ui-extensions-react/admin';
import { useEffect, useState } from 'react';

export default reactExtension('admin.order-details.block.render', () => <App />);

function App() {
  const api = useApi();
  const i18n = useI18n(); // Correctly obtain i18n
  const data = api['data'];
  const query = api['query'];

  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState(null);

  const selectedOrder = data?.selected?.[0];
  const orderId = selectedOrder?.id;

  useEffect(() => {
    if (!orderId) return;

    const fetchSubscription = async () => {
      try {
        const result = await query(
          `query getOrderSubscription($id: ID!) {
            order(id: $id) {
              customer {
                subscriptionContracts(first: 1, status: ACTIVE) {
                  nodes {
                    id
                    status
                    nextBillingDate
                    lines(first: 1) {
                      nodes { title }
                    }
                  }
                }
              }
            }
          }`,
          { variables: { id: orderId } }
        );

        const orderData = result?.data?.['order'];
        const contracts = orderData?.customer?.subscriptionContracts?.nodes;
        
        if (contracts && contracts.length > 0) {
          setContract(contracts[0]);
        }
      } catch (error) {
        console.error("Error fetching subscription:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [orderId, query]);

  if (loading) {
    return (
      <AdminBlock title={i18n.translate('title')}>
        <BlockStack inlineAlignment="center">
          {/* FIX: Added required 'size' prop */}
          <ProgressIndicator size="small" />
        </BlockStack>
      </AdminBlock>
    );
  }

  if (!contract) {
    return (
      <AdminBlock title={i18n.translate('title')}>
        <Text>{i18n.translate('no_subscription')}</Text>
      </AdminBlock>
    );
  }

  return (
    <AdminBlock title={i18n.translate('title')}>
      <BlockStack gap="base">
        <InlineStack blockAlignment="center" inlineAlignment="space-between">
          <Text fontWeight="bold">{i18n.translate('status')}</Text>
          <Badge tone="success">{contract.status}</Badge>
        </InlineStack>
        
        <Divider />

        <BlockStack gap="base">
          <Text fontWeight="bold" size="large">
            {contract.lines.nodes[0]?.title || "Subscription Plan"}
          </Text>
          
          <InlineStack inlineAlignment="space-between">
            <Text>{i18n.translate('next_billing')}</Text>
            <Text>
              {contract.nextBillingDate 
                ? new Date(contract.nextBillingDate).toLocaleDateString() 
                : "N/A"}
            </Text>
          </InlineStack>

          <InlineStack inlineAlignment="space-between">
             <Text size="small">{i18n.translate('contract_id')}</Text>
             <Text size="small">{contract.id.split('/').pop()}</Text>
          </InlineStack>
        </BlockStack>

        <Button onPress={() => console.log("Open App")}>
          {i18n.translate('view_in_app')}
        </Button>
      </BlockStack>
    </AdminBlock>
  );
}
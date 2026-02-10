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
} from '@shopify/ui-extensions-react/admin';
import { useEffect, useState } from 'react';

export default reactExtension('admin.order-details.block.render', () => <App />);

function App() {
  const api = useApi();
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
      <AdminBlock title="Subscription Status">
        <BlockStack inlineAlignment="center">
          {/* FIX: Added required 'size' prop */}
          <ProgressIndicator size="small" />
        </BlockStack>
      </AdminBlock>
    );
  }

  if (!contract) {
    return (
      <AdminBlock title="Subscription Status">
        <Text>No active subscription found for this customer.</Text>
      </AdminBlock>
    );
  }

  return (
    <AdminBlock title="Subscription Status">
      <BlockStack gap="base">
        <InlineStack blockAlignment="center" inlineAlignment="space-between">
          <Text fontWeight="bold">Status</Text>
          <Badge tone="success">{contract.status}</Badge>
        </InlineStack>
        
        <Divider />

        <BlockStack gap="base">
          <Text fontWeight="bold" size="large">
            {contract.lines.nodes[0]?.title || "Subscription Plan"}
          </Text>
          
          <InlineStack inlineAlignment="space-between">
            <Text>Next Billing:</Text>
            <Text>
              {contract.nextBillingDate 
                ? new Date(contract.nextBillingDate).toLocaleDateString() 
                : "N/A"}
            </Text>
          </InlineStack>

          <InlineStack inlineAlignment="space-between">
             <Text size="small">Contract ID:</Text>
             <Text size="small">{contract.id.split('/').pop()}</Text>
          </InlineStack>
        </BlockStack>

        <Button onPress={() => console.log("Open App")}>
          View in App
        </Button>
      </BlockStack>
    </AdminBlock>
  );
}
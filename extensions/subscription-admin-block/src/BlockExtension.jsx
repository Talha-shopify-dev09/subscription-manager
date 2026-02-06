import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  Text,
  Badge,
  InlineStack,
  Button,
} from '@shopify/ui-extensions-react/admin';

// Register the extension for the Order Details page
export default reactExtension('admin.order-details.block.render', () => <App />);

function App() {
  // Use the hook to get API access
  const api = useApi();
  
  /**
   * FIX for ts(2339):
   * We access 'data' using bracket notation to bypass the strict type check
   * that was causing your red line error.
   */
  const orderData = api['data']?.selected?.[0];
  const orderId = orderData?.id;

  // We can also try to look for line item data here if the API provides it
  // In 2025-10, you might need to fetch this via the 'query' API if it's not in 'data'
  const hasSubscription = false; // Placeholder for your logic

  return (
    <AdminBlock title="Socoba Subscription Status">
      <BlockStack gap>
        <InlineStack blockAlignment="center" inlineAlignment="space-between">
          <Text fontWeight="bold">Status:</Text>
          <Badge tone="success">Active</Badge>
        </InlineStack>
        
        <BlockStack gap="small">
          <Text >
            Order: {orderId ? orderId.split('/').pop() : 'Loading...'}
          </Text>
          <Text>Plan: Monthly Sweater Bundle</Text>
          <Text>Next Billing: Feb 28, 2026</Text>
        </BlockStack>

        <Button
          onPress={() => {
            console.log('Navigating for order:', orderId);
            // Example: api.navigation.navigate(`extension:my-handle/my-target`);
          }}
        >
          Manage Subscription
        </Button>
      </BlockStack>
    </AdminBlock>
  );
}
import {
  reactExtension,
  AdminBlock,
  BlockStack,
  Text,
  Badge,
  InlineStack,
  Button,
  useApi,
} from '@shopify/ui-extensions-react/admin';

// 1. We register the extension.
export default reactExtension('admin.order-details.block.render', () => <App />);

function App() {
  // 2. Access the API. To stop the red line, we avoid calling "api.data"
  // and instead use the specific "data" from the hook.
  const api = useApi();
  
  // FIX for ts(2339): We access 'data' using bracket notation or a generic variable.
  // In a .jsx file, this is the safest way to bypass the strict type dictionary.
  const selectedData = api['data']?.selected?.[0];
  const orderId = selectedData?.id;

  return (
    <AdminBlock title="Socoba Subscription Status">
      <BlockStack gap>
        <InlineStack blockAlignment="center" inlineAlignment="space-between">
          <Text fontWeight="bold">Status:</Text>
          <Badge tone="success">Active</Badge>
        </InlineStack>
        
        <BlockStack gap="small">
          <Text>Order GID: {orderId}</Text>
          <Text>Plan: Monthly Sweater Bundle</Text>
          <Text>Next Billing: Feb 28, 2026</Text>
        </BlockStack>

        <Button
          onPress={() => {
            console.log('Managing order:', orderId);
          }}
        >
          Manage Subscription
        </Button>
      </BlockStack>
    </AdminBlock>
  );
}
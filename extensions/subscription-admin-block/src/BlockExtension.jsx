import {
  reactExtension,
  AdminBlock,
  BlockStack,
  Text,
  Badge,
  InlineStack,
  Button,
} from '@shopify/ui-extensions-react/admin';

// 1. This connects the code to the Order details page in Shopify Admin
export default reactExtension('admin.order-details.block.render', () => <App />);

function App() {
  return (
    <AdminBlock title="Socoba Subscription Status">
      {/* Changed 'base' to 'medium' */}
      <BlockStack gap="base">
        <InlineStack blockAlignment="center" inlineAlignment="space-between">
          <Text fontWeight="bold">Status:</Text>
          <Badge tone="success">Active</Badge>
        </InlineStack>
        
        {/* Changed 'extraTight' to 'small' */}
        <BlockStack gap="small">
          <Text>Plan: Monthly Sweater Bundle</Text>
          <Text>Next Billing: Feb 28, 2026</Text>
        </BlockStack>

        <Button
          onPress={() => {
            console.log('Navigate to subscription management');
          }}
        >
          Manage Subscription
        </Button>
      </BlockStack>
    </AdminBlock>
  );
}
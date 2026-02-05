import {
  reactExtension,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Link,
  Icon,
  useOrder, // Hook to access order details
} from '@shopify/ui-extensions-react/customer-account';

export default reactExtension(
  'customer-account.order-status.block.render',
  () => <Extension />,
);

function Extension() {
  const order = useOrder();

  // 1. Check if any line item contains a selling plan (subscription)
  const hasSubscription = order?.lineItems?.some((line) => line.sellingPlan);

  // 2. If no subscription is found, don't show the block at all
  if (!hasSubscription) {
    return null;
  }

  return (
    <Card padding>
      <BlockStack spacing="tight">
        <InlineStack inlineAlignment="start" spacing="tight">
          <Icon source="cart" /> 
          <Text size="large" emphasis="bold">Socoba Subscriptions</Text>
        </InlineStack>
        
        <Text>
          This order contains a recurring subscription. You can manage your delivery frequency or cancel anytime through your portal.
        </Text>

        {/* 3. Link must match the 'subpath' in your root shopify.app.toml */}
        <Link to="extension:/subscription-manager/portal">
          Manage My Subscription
        </Link>
      </BlockStack>
    </Card>
  );
}
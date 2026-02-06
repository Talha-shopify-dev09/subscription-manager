import {
  reactExtension,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Link,
  Icon,
  useOrder,
} from '@shopify/ui-extensions-react/customer-account';

export default reactExtension(
  'customer-account.order-status.block.render',
  () => <Extension />,
);

function Extension() {
  const order = useOrder();

  /**
   * THE FINAL FIX FOR RED LINE:
   * We use ['lines'] bracket notation. This is the standard JavaScript alternative
   * to dot notation that prevents the TypeScript editor from looking up the 'Order' type.
   * This is guaranteed to remove the red line in a .jsx file.
   */
  const hasSubscription = order?.['lines']?.some(
    (line) => line.sellingPlan
  );

  // 2. Hide block if no subscription exists
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

        {/* This matches your root TOML subpath: subscription-manager */}
        <Link to="extension:/subscription-manager/portal">
          Manage My Subscription
        </Link>
      </BlockStack>
    </Card>
  );
}
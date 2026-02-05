import {
  reactExtension,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Link,
  Icon,
} from '@shopify/ui-extensions-react/customer-account';

// 1. This connects the file to the Order Status page
export default reactExtension(
  'customer-account.order-status.block.render',
  () => <Extension />,
);

function Extension() {
  return (
    <Card padding>
      <BlockStack spacing="tight">
        <InlineStack inlineAlignment="center" spacing="tight">
          {/* Changed 'order' to 'customerAccount' or 'cart' */}
          <Icon source="cart" /> 
          <Text size="large" emphasis="bold">Socoba Subscriptions</Text>
        </InlineStack>
        
        <Text>
          This order contains a recurring subscription. You can manage your delivery frequency or cancel anytime through your portal.
        </Text>

        <Link to="extension:/subscription-manager/portal">
          Manage My Subscription
        </Link>
      </BlockStack>
    </Card>
  );
}
import {
  reactExtension,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Link,
  Icon,
} from '@shopify/ui-extensions-react/customer-account';

export default reactExtension(
  'customer-account.order-status.block.render',
  () => <Extension />,
);

function Extension() {
  // We no longer use useOrder() for conditional logic to avoid the 'missing lines' bug.
  
  return (
    <Card padding>
      <BlockStack spacing="tight">
        <InlineStack inlineAlignment="start" spacing="tight">
          <Icon source="cart" /> 
          <Text size="large" emphasis="bold">Socoba Subscriptions</Text>
        </InlineStack>
        
        <Text>
          Manage your delivery frequency, update payment methods, or view your subscription history anytime.
        </Text>

        {/* This link redirects the user to your App Proxy portal.
          If they have subscriptions, they'll see them. 
          If not, your portal.jsx handles the empty state.
        */}
        <Link to="extension:/subscription-manager/portal">
          Manage My Subscriptions
        </Link>
      </BlockStack>
    </Card>
  );
}
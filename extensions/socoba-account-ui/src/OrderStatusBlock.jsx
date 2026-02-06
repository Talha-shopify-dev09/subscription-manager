import {
  reactExtension,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Link,
  Icon,
  useApi,
} from '@shopify/ui-extensions-react/customer-account';

export default reactExtension(
  'customer-account.order-status.block.render',
  () => <Extension />,
);

function Extension() {
  const { navigation } = useApi();

  const handleNavigate = () => {
    // onPress handles the event prevention automatically in many UI components
    navigation.navigate('extension:socoba-subscription-portal');
  };

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

        {/* Use onPress instead of onClick for Shopify UI components */}
        <Link onPress={handleNavigate}>
          Manage My Subscription
        </Link>
      </BlockStack>
    </Card>
  );
}
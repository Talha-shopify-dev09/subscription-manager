import {
  reactExtension,
  useApi,
  BlockStack,
  InlineStack,
  Text,
  Heading,
  Card,
  Spinner,
  Divider,
  Badge,
  Button
} from '@shopify/ui-extensions-react/customer-account';
import { useEffect, useState } from 'react';

export default reactExtension(
  'customer-account.page.render',
  () => <SubscriptionPage />,
);

function SubscriptionPage() {
  const { i18n, toast } = useApi(); // Removed 'query' from destructuring
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Loading states for each action, per contract ID
  const [isPausing, setIsPausing] = useState({});
  const [isCancelling, setIsCancelling] = useState({});
  const [isActivating, setIsActivating] = useState({});

  const CONTRACT_QUERY = `
    query {
      customer {
        subscriptionContracts(first: 50) {
          nodes {
            id
            status
            nextBillingDate
            lines(first: 5) {
              nodes {
                title
                quantity
              }
            }
          }
        }
      }
    }
  `;

      const fetchSubscriptions = async () => {

        setLoading(true);

        setError(null);

        try {

          const response = await fetch("shopify://customer-account/api/unstable/graphql.json", { // Removed Cache-busting

            method: 'POST',

            headers: {

              'Content-Type': 'application/json',

            },

            body: JSON.stringify({

              query: CONTRACT_QUERY,

            }),

          });

          const responseText = await response.text();

    

          let result;

          try {

            result = JSON.parse(responseText);

          } catch (jsonError) {

            setError(i18n.translate('error_fetching_subscriptions'));

            setLoading(false);

            return;

          }

          

          if (result.errors && result.errors.length > 0) {

            setError(result.errors[0].message);

            setLoading(false);

            return;

          }

    
            const customerData = result?.data?.customer;
          if (!customerData || !customerData.subscriptionContracts) {
            setError(i18n.translate('no_customer_data_or_contracts'));
            setLoading(false);
            return;
          }
          
          const fetchedNodes = customerData.subscriptionContracts.nodes || [];
          setContracts(fetchedNodes);
          setLoading(false);
        } catch (err) {
          setError(i18n.translate('error_fetching_subscriptions'));
          setLoading(false);
        }
      };
    
      useEffect(() => {
        fetchSubscriptions();
      }, []); // Empty dependency array means this runs once on mount
    
      const handleAction = async (contractId, mutationQuery, actionType, setLoadingState) => {
        setLoadingState(prev => ({ ...prev, [contractId]: true }));
    
        try {
                const response = await fetch("shopify://customer-account/api/unstable/graphql.json", { // Removed Cache-busting
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    query: mutationQuery,
                    variables: { subscriptionContractId: contractId },
                  }),
                });
      const responseText = await response.text();

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (jsonError) {
        toast.show(i18n.translate('action_error'));
        return;
      }
      
      if (result.errors && result.errors.length > 0) {
        toast.show(result.errors[0].message);
        return;
      }

      const mutationKey = `subscriptionContract${actionType}`;
      const userErrors = result.data?.[mutationKey]?.userErrors;
      if (userErrors && userErrors.length > 0) {
        toast.show(userErrors[0].message);
        return;
      }

      toast.show(i18n.translate(`${actionType.toLowerCase()}_success`));
      fetchSubscriptions(); // Re-fetch to update UI after successful action
    } catch (error) {
      toast.show(i18n.translate('action_error'));
    } finally {
      setLoadingState(prev => ({ ...prev, [contractId]: false }));
    }
  };

  const handlePause = (contractId) => handleAction(
    contractId,
    `mutation SubscriptionContractPause($subscriptionContractId: ID!) {
      subscriptionContractPause(subscriptionContractId: $subscriptionContractId) {
        contract {
          id
          status
        }
        userErrors {
          message
          field
        }
      }
    }`,
    'Pause',
    setIsPausing
  );

  const handleActivate = (contractId) => handleAction(
    contractId,
    `mutation SubscriptionContractActivate($subscriptionContractId: ID!) {
      subscriptionContractActivate(subscriptionContractId: $subscriptionContractId) {
        contract {
          id
          status
        }
        userErrors {
          message
          field
        }
      }
    }`,
    'Activate',
    setIsActivating
  );

  const handleCancel = (contractId) => handleAction(
    contractId,
    `mutation SubscriptionContractCancel($subscriptionContractId: ID!) {
      subscriptionContractCancel(subscriptionContractId: $subscriptionContractId) {
        contract {
          id
          status
        }
        userErrors {
          message
          field
        }
      }
    }`,
    'Cancel',
    setIsCancelling
  );

  if (loading) {
    return (
      <BlockStack inlineAlignment="center" padding="extraLoose">
        <Spinner />
        <Text>{i18n.translate('loading')}</Text>
      </BlockStack>
    );
  }

  if (error) {
    return (
      <Card padding>
        <Text tone="critical">{error}</Text>
      </Card>
    );
  }

  return (
    <BlockStack spacing="loose">
      {/* Removed Toast component as api.toast.show is used directly */}
      <Heading>{i18n.translate('title')}</Heading>
      <Divider />

      {contracts.length === 0 ? (
        <Card padding>
          <Text>{i18n.translate('no_subscriptions')}</Text>
        </Card>
      ) : (
        contracts.map((contract) => (
          <Card key={contract.id} padding>
            <BlockStack spacing="loose">
              <InlineStack inlineAlignment="space-between" blockAlignment="center">
                 <BlockStack spacing="extraTight">
                    <Text size="large" emphasis="bold">
                      {contract.lines.nodes[0]?.title || "Subscription Plan"}
                    </Text>
                    <InlineStack spacing="tight">
                       <Text appearance="subdued">{i18n.translate('status')}</Text>
                       <Badge tone={contract.status === 'ACTIVE' ? 'success' : (contract.status === 'PAUSED' ? 'warning' : 'critical')}>
                          {contract.status}
                       </Badge>
                    </InlineStack>
                 </BlockStack>

                 <InlineStack>
                    {contract.status === 'PAUSED' ? (
                        <Button
                            kind="primary"
                            onPress={() => handleActivate(contract.id)}
                            loading={isActivating[contract.id]}
                            disabled={isActivating[contract.id]}
                        >
                            {i18n.translate('continue_subscription')}
                        </Button>
                    ) : (
                        <Button
                            kind="secondary"
                            onPress={() => handlePause(contract.id)}
                            loading={isPausing[contract.id]}
                            disabled={isPausing[contract.id]}
                        >
                            {i18n.translate('pause_subscription')}
                        </Button>
                    )}
                    <Button
                        kind="destructive"
                        onPress={() => handleCancel(contract.id)}
                        loading={isCancelling[contract.id]}
                        disabled={isCancelling[contract.id]}
                    >
                        {i18n.translate('remove_subscription')}
                    </Button>
                 </InlineStack>
              </InlineStack>

              <BlockStack spacing="none">
                <Text appearance="subdued">
                  {i18n.translate('next_billing')} {contract.nextBillingDate ? new Date(contract.nextBillingDate).toLocaleDateString() : "N/A"}
                </Text>
                <Text size="small" appearance="subdued">
                   {i18n.translate('contract_id')} {contract.id.split('/').pop()}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        ))
      )}
    </BlockStack>
  );
}



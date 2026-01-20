import { useLoaderData, Link } from "react-router";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Box,
  Button,
  Divider,
  InlineStack,
  Icon,
  Banner
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  XCircleIcon,
  PauseCircleIcon,
  SettingsIcon,
  ArrowRightIcon
} from "@shopify/polaris-icons";

// --- LOADER: SAFE MODE ---
export async function loader({ request }) {
  // 1. Authenticate
  const { admin } = await authenticate.admin(request);

  try {
    // 2. Try to fetch stats
    const statsResponse = await admin.graphql(
      `#graphql
      query getSubscriptionStats {
        active: subscriptionContracts(first: 5, query: "status:ACTIVE") {
          edges { node { id } }
        }
        cancelled: subscriptionContracts(first: 5, query: "status:CANCELLED") {
          edges { node { id } }
        }
        paused: subscriptionContracts(first: 5, query: "status:PAUSED") {
          edges { node { id } }
        }
      }`
    );

    const statsJson = await statsResponse.json();

    // 3. Safety Check: Did Shopify return an error?
    if (statsJson.errors) {
      console.log("Analytics Error:", JSON.stringify(statsJson.errors));
      return { activeCount: 0, cancelledCount: 0, pausedCount: 0, error: true };
    }

    return {
      activeCount: statsJson.data?.active?.edges?.length || 0,
      cancelledCount: statsJson.data?.cancelled?.edges?.length || 0,
      pausedCount: statsJson.data?.paused?.edges?.length || 0,
      error: false
    };

  } catch (error) {
    // 4. Fallback if everything fails
    console.error("Loader Crash:", error);
    return { activeCount: 0, cancelledCount: 0, pausedCount: 0, error: true };
  }
}

// --- UI: DASHBOARD ---
export default function Index() {
  const { activeCount, cancelledCount, pausedCount, error } = useLoaderData();

  return (
    <Page title="Dashboard">
      <Layout>
        
        {/* 1. WELCOME SECTION */}
        <Layout.Section>
          <Box paddingBlockEnd="400">
             <Text variant="headingLg" as="h1">Welcome back, Talha</Text>
             <Text variant="bodyMd" as="p" tone="subdued">Here is what's happening with your subscriptions today.</Text>
          </Box>
        </Layout.Section>

        {/* ERROR BANNER (Only shows if permissions are missing) */}
        {error && (
          <Layout.Section>
            <Banner tone="warning" title="Analytics Unavailable">
              <p>We couldn't load your subscription stats. This usually means the <code>read_own_subscription_contracts</code> scope is missing or pending approval.</p>
            </Banner>
          </Layout.Section>
        )}

        {/* 2. ANALYTICS CARDS */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            
            {/* Active Card */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingSm" as="h3">Active</Text>
                  <Box background="bg-surface-success" padding="100" borderRadius="200">
                    <Icon source={CheckCircleIcon} tone="success" />
                  </Box>
                </InlineStack>
                <Text variant="heading3xl" as="p" fontWeight="bold">{activeCount}</Text>
                <Text variant="bodySm" tone="subdued">Active contracts</Text>
              </BlockStack>
            </Card>

            {/* Paused Card */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingSm" as="h3">Paused</Text>
                  <Box background="bg-surface-warning" padding="100" borderRadius="200">
                     <Icon source={PauseCircleIcon} tone="warning" />
                  </Box>
                </InlineStack>
                <Text variant="heading3xl" as="p" fontWeight="bold">{pausedCount}</Text>
                <Text variant="bodySm" tone="subdued">Temporarily stopped</Text>
              </BlockStack>
            </Card>

            {/* Cancelled Card */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingSm" as="h3">Cancelled</Text>
                  <Box background="bg-surface-critical" padding="100" borderRadius="200">
                    <Icon source={XCircleIcon} tone="critical" />
                  </Box>
                </InlineStack>
                <Text variant="heading3xl" as="p" fontWeight="bold">{cancelledCount}</Text>
                <Text variant="bodySm" tone="subdued">Lost subscriptions</Text>
              </BlockStack>
            </Card>

          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Divider borderStyle="base" />
        </Layout.Section>

        {/* 3. MAIN ACTION */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">Subscription Plans</Text>
                  <Text variant="bodyMd" as="p" tone="subdued">
                    Create new selling plans, edit existing pricing, or manage product associations.
                  </Text>
                </BlockStack>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                   <Icon source={SettingsIcon} />
                </Box>
              </InlineStack>
              
              <InlineStack align="start">
                <Link to="/app/subscriptions" style={{ textDecoration: 'none' }}>
                  <Button variant="primary" size="large" icon={ArrowRightIcon}>
                    Manage Subscriptions
                  </Button>
                </Link>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
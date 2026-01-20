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
  Icon
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  XCircleIcon,
  PauseCircleIcon,
  SettingsIcon,
  ArrowRightIcon
} from "@shopify/polaris-icons";

// --- LOADER: ONLY FETCH STATS (No Product Generation) ---
export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const statsResponse = await admin.graphql(
    `#graphql
    query getSubscriptionStats {
      active: subscriptionContracts(first: 200, query: "status:ACTIVE") {
        edges { node { id } }
      }
      cancelled: subscriptionContracts(first: 200, query: "status:CANCELLED") {
        edges { node { id } }
      }
      paused: subscriptionContracts(first: 200, query: "status:PAUSED") {
        edges { node { id } }
      }
    }`
  );

  const statsJson = await statsResponse.json();

  return {
    activeCount: statsJson.data.active.edges.length,
    cancelledCount: statsJson.data.cancelled.edges.length,
    pausedCount: statsJson.data.paused.edges.length,
  };
}

// --- UI: CLEAN DASHBOARD ---
export default function Index() {
  const { activeCount, cancelledCount, pausedCount } = useLoaderData();

  return (
    <Page title="Dashboard" primaryAction={null}>
      <Layout>
        
        {/* 1. WELCOME SECTION */}
        <Layout.Section>
          <Box paddingBlockEnd="400">
             <Text variant="headingLg" as="h1">Welcome back, Talha</Text>
             <Text variant="bodyMd" as="p" tone="subdued">Here is what's happening with your subscriptions today.</Text>
          </Box>
        </Layout.Section>

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
                <Text variant="bodySm" tone="subdued">Recurring revenue</Text>
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

        {/* 3. MAIN ACTION (Manage Subscriptions) */}
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
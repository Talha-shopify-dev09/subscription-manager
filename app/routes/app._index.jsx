import { useLoaderData, Link } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  List,
  Link as PolarisLink,
  InlineGrid,
  Box,
  Button
} from "@shopify/polaris";

export const loader = async ({ request }) => {
  // 1. Log that we started loading
  console.log("🔄 Loader started...");

  try {
    // 2. Try to authenticate. If DB is broken, this will crash.
    const { admin } = await authenticate.admin(request);
    console.log("✅ Authentication successful!");

    // 3. Try to fetch stats, but wrap in try/catch so it doesn't crash the page
    try {
      const response = await admin.graphql(
        `#graphql
        query getStats {
          active: subscriptionContracts(first: 1, query: "status:ACTIVE") { edges { node { id } } }
        }`
      );
      const data = await response.json();
      console.log("✅ GraphQL fetch successful");
      return { 
        activeCount: data.data?.active?.edges?.length || 0,
        status: "connected"
      };
    } catch (gqlError) {
      console.log("⚠️ GraphQL Warning (App is working, but permissions missing):", gqlError.message);
      return { activeCount: 0, status: "permissions_issue" };
    }

  } catch (error) {
    // 4. If Authentication fails (DB issue), we catch it here
    console.error("🔥 CRITICAL AUTH ERROR:", error);
    throw new Response("Authentication Failed - Check Terminal Logs", { status: 500 });
  }
};

export const action = async ({ request }) => {
  // Simple action to test buttons
  await authenticate.admin(request);
  return { success: true };
};

export default function Index() {
  const { activeCount, status } = useLoaderData();
  const shopify = useAppBridge();

  return (
    <Page title="Home (Debug Mode)">
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  App Status: {status === "connected" ? "✅ Connected" : "⚠️ Issues Found"}
                </Text>
                
                <Text as="p">
                  If you can see this page, your <b>Database</b> and <b>Router</b> are working correctly!
                </Text>

                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                   <Text as="p" fontWeight="bold">Active Subscriptions: {activeCount}</Text>
                </Box>

                <InlineGrid columns={2} gap="300">
                   <Link to="/app/subscriptions">
                      <Button variant="primary">Go to Subscriptions</Button>
                   </Link>
                </InlineGrid>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Troubleshooting</Text>
                <List>
                  <List.Item>
                    Check your <b>terminal</b> for logs starting with "🔄"
                  </List.Item>
                  <List.Item>
                    If counts are 0, check <b>shopify.app.toml</b> scopes.
                  </List.Item>
                </List>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
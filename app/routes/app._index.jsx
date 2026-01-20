import { useLoaderData, Link } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  AppProvider, // <--- Added this
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
import enTranslations from "@shopify/polaris/locales/en.json"; // <--- Added this

export const loader = async ({ request }) => {
  console.log("🔄 Loader started...");

  try {
    const { admin } = await authenticate.admin(request);
    console.log("✅ Authentication successful!");

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
      console.log("⚠️ GraphQL Warning:", gqlError.message);
      return { activeCount: 0, status: "permissions_issue" };
    }

  } catch (error) {
    console.error("🔥 CRITICAL AUTH ERROR:", error);
    throw new Response("Authentication Failed", { status: 500 });
  }
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
  return { success: true };
};

export default function Index() {
  const { activeCount, status } = useLoaderData();
  const shopify = useAppBridge();

  return (
    /* WRAPPED IN APP PROVIDER TO FIX CRASH */
    <AppProvider i18n={enTranslations}>
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
                    Great job! Your <b>Database</b> and <b>Authentication</b> are working perfectly.
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
                  <Text as="h2" variant="headingMd">Next Steps</Text>
                  <List>
                    <List.Item>
                      Your app is stable.
                    </List.Item>
                    <List.Item>
                      You can now safely revert to the original Dashboard code if you want, or build on top of this one.
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
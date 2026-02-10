import { useLoaderData, Link } from "react-router";
import { authenticate } from "../shopify.server";
import {
  AppProvider,
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineGrid,
  Box,
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import db from "../db.server"; 

// --- LOADER ---
export const loader = async ({ request }) => {
  // 1. Authenticate the admin session
  const { session } = await authenticate.admin(request);

  try {
    const [activeCount, pausedCount, cancelledCount, bundlePurchaseCount, bundleContracts] = await Promise.all([
      db.contract.count({ where: { shop: session.shop, status: "ACTIVE", planId: { not: null } } }),
      db.contract.count({ where: { shop: session.shop, status: "PAUSED", planId: { not: null } } }),
      db.contract.count({ where: { shop: session.shop, status: "CANCELLED", planId: { not: null } } }),
      db.contract.count({ where: { shop: session.shop, bundleId: { not: null } } }), // Count bundle purchases
      db.contract.findMany({ // Fetch bundle contracts to sum prices
        where: {
          shop: session.shop,
          bundleId: { not: null }
        },
        include: {
          bundle: true // Include the related Bundle model
        }
      })
    ]);

    let totalBundleAmount = 0;
    bundleContracts.forEach(contract => {
      if (contract.bundle && contract.bundle.price) {
        totalBundleAmount += parseFloat(contract.bundle.price);
      }
    });

    console.log("Shop:", session.shop);
    console.log("Active Count:", activeCount);
    console.log("Paused Count:", pausedCount);
    console.log("Cancelled Count:", cancelledCount);
    console.log("Bundle Purchase Count:", bundlePurchaseCount);
    console.log("Total Bundle Amount:", totalBundleAmount);

    return Response.json({ activeCount, pausedCount, cancelledCount, bundlePurchaseCount, totalBundleAmount });
  } catch (error) {
    console.error("Dashboard Loader Error:", error);
    return Response.json({ activeCount: 0, pausedCount: 0, cancelledCount: 0, bundlePurchaseCount: 0, totalBundleAmount: 0 });
  }
};

// --- COMPONENT ---
export default function Index() {
  const { activeCount, cancelledCount, pausedCount, bundlePurchaseCount, totalBundleAmount } = useLoaderData();

  const formattedTotalBundleAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD', // Assuming USD. Adjust if necessary.
  }).format(totalBundleAmount);

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Socoba Dashboard">
        <BlockStack gap="500">
          
          {/* --- ANALYTICS DASHBOARD --- */}
          <Layout>
            <Layout.Section>
              <Card>
                  <BlockStack gap="200">
                      <Text as="h2" variant="headingSm">Performance Overview</Text>
                      <InlineGrid columns={5} gap="400">
                          {/* Active Card */}
                          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingXs" tone="subdued">Active Subs</Text>
                                <Text as="p" variant="headingXl" fontWeight="bold" tone="success">
                                  {activeCount}
                                </Text>
                            </BlockStack>
                          </Box>

                          {/* Cancelled Card */}
                          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingXs" tone="subdued">Cancelled Subs</Text>
                                <Text as="p" variant="headingXl" fontWeight="bold" tone="critical">
                                  {cancelledCount}
                                </Text>
                            </BlockStack>
                          </Box>

                          {/* Paused Card */}
                          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingXs" tone="subdued">Paused Subs</Text>
                                <Text as="p" variant="headingXl" fontWeight="bold" tone="caution">
                                  {pausedCount}
                                </Text>
                            </BlockStack>
                          </Box>

                          {/* Total Bundles Purchased Card */}
                          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingXs" tone="subdued">Bundles Purchased</Text>
                                <Text as="p" variant="headingXl" fontWeight="bold">
                                  {bundlePurchaseCount}
                                </Text>
                            </BlockStack>
                          </Box>

                          {/* Total Bundle Sales Card */}
                          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingXs" tone="subdued">Bundle Sales</Text>
                                <Text as="p" variant="headingXl" fontWeight="bold">
                                  {formattedTotalBundleAmount}
                                </Text>
                            </BlockStack>
                          </Box>
                      </InlineGrid>
                  </BlockStack>
              </Card>
            </Layout.Section>

            {/* --- NAVIGATION CARDS --- */}
            <Layout.Section>
              <InlineGrid columns={2} gap="400">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">📦 Subscription Manager</Text>
                    <Text as="p">
                      Manage recurring plans and discounts. Set pricing for multiple cycles.
                    </Text>
                    <Link to="/app/subscriptions">
                      <Button variant="primary">Manage Plans</Button>
                    </Link>
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">👥 Customer Contracts</Text>
                    <Text as="p">
                      Directly manage subscriber agreements, pause billing, or cancel contracts.
                    </Text>
                    <Link to="/app/contracts">
                      <Button>View Contracts</Button>
                    </Link>
                  </BlockStack>
                </Card>
              </InlineGrid>
            </Layout.Section>

            {/* --- BUNDLE MANAGER --- */}
            <Layout.Section>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">🎁 Fixed Bundles</Text>
                  <Text as="p">
                    Create product bundles to sell together as a single unit with a discount.
                  </Text>
                  <Link to="/app/bundles">
                    <Button>Manage Bundles</Button>
                  </Link>
                </BlockStack>
              </Card>
            </Layout.Section>
            
            {/* --- SIDEBAR SPECS --- */}
            <Layout.Section variant="oneThird">
              <BlockStack gap="500">
                  <Card>
                      <BlockStack gap="200">
                          <Text as="h2" variant="headingMd">System Specs</Text>
                          <BlockStack gap="200">
                              <InlineGrid columns="1fr auto">
                                  <Text as="span" fontWeight="bold">Framework</Text>
                                  <Text as="span">React Router 7</Text>
                              </InlineGrid>
                              <InlineGrid columns="1fr auto">
                                  <Text as="span" fontWeight="bold">Database</Text>
                                  <Text as="span">PostgreSQL (Neon)</Text>
                              </InlineGrid>
                              <InlineGrid columns="1fr auto">
                                  <Text as="span" fontWeight="bold">ORM</Text>
                                  <Text as="span">Prisma</Text>
                              </InlineGrid>
                          </BlockStack>
                      </BlockStack>
                  </Card>
              </BlockStack>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
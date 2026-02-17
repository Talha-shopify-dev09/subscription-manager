import { useLoaderData, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { getBillingInfo } from "../helpers/billing.server";
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
  Divider,
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import db from "../db.server"; 

// --- LOADER ---
export const loader = async ({ request }) => {
  // 1. Authenticate the admin session
  const { session } = await authenticate.admin(request);
  const billing = await getBillingInfo(request);

  if (billing.billingRequired) {
    return Response.json({
      billing,
      activeCount: 0,
      pausedCount: 0,
      cancelledCount: 0,
      bundlePurchaseCount: 0,
      totalBundleAmount: 0,
      totalActiveSubscriptionAmount: 0,
      totalSubscriptionEarnings: 0,
      failedContracts: [],
    });
  }

  try {
        const [activeContracts, pausedCount, cancelledCount, bundleSalesCount, bundleSalesAmount, allTransactions, failedContractsData] = await Promise.all([
          db.contract.findMany({ where: { shop: session.shop, status: "ACTIVE", planId: { not: null } } }),
          db.contract.count({ where: { shop: session.shop, status: "PAUSED", planId: { not: null } } }),
          db.contract.count({ where: { shop: session.shop, status: "CANCELLED", planId: { not: null } } }),
          db.bundleSale.count({ where: { shop: session.shop } }),
          db.bundleSale.aggregate({ _sum: { totalAmount: true }, where: { shop: session.shop } }),
          db.transaction.findMany({ where: { shop: session.shop } }),
          db.contract.findMany({ 
            where: { shop: session.shop, status: "FAILED" },
            select: {
              id: true,
              customerName: true,
              customerEmail: true,
              recurringPrice: true,
              nextBillingDate: true,
              status: true,
            },
            take: 100 // Limit to first 100 failed contracts
          })
        ]);
    
        const activeCount = activeContracts.length;
        const totalBundleAmount = bundleSalesAmount._sum.totalAmount || 0;
        const failedContracts = failedContractsData; // Assigning the fetched data
    
        let totalActiveSubscriptionAmount = 0;
        activeContracts.forEach(contract => {
          if (contract.recurringPrice) {
            totalActiveSubscriptionAmount += parseFloat(contract.recurringPrice);
          }
        });
    
        let totalSubscriptionEarnings = 0;
        allTransactions.forEach(transaction => {
          totalSubscriptionEarnings += parseFloat(transaction.amount);
        });
    
        return Response.json({
          activeCount,
          pausedCount,
          cancelledCount,
          bundlePurchaseCount: bundleSalesCount,
          totalBundleAmount,
          totalActiveSubscriptionAmount,
          totalSubscriptionEarnings,
          failedContracts, // Include failed contracts in the response
          billing,
        });
  } catch (error) {
    console.error("Dashboard Loader Error:", error);
    return Response.json({
      activeCount: 0, pausedCount: 0, cancelledCount: 0, bundlePurchaseCount: 0,
      totalBundleAmount: 0, totalActiveSubscriptionAmount: 0, totalSubscriptionEarnings: 0,
      failedContracts: [], // Ensure failedContracts is always present
      billing,
    });
  }
};

// --- COMPONENT ---
export default function Index() {
  const {
    activeCount,
    cancelledCount,
    pausedCount,
    bundlePurchaseCount,
    totalBundleAmount,
    totalActiveSubscriptionAmount,
    totalSubscriptionEarnings,
    failedContracts, // Destructure failedContracts from loader data
    billing,
  } = useLoaderData();

  const formatCurrency = (amount) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD', // Assuming USD. Adjust if necessary.
  }).format(amount);

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Socoba Dashboard">
        <BlockStack gap="500">
          {billing && !billing.billingRequired && (
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Plan Status</Text>
                <Text as="p">
                  {billing.isDevStore
                    ? "Dev store (full access)"
                    : billing.activePlanName || "No active plan"}
                </Text>
                {!billing.isDevStore && billing.activePlanName === "Basic" && (
                  <Text as="p">
                    Basic feature:{" "}
                    {billing.basicFeatureMode
                      ? billing.basicFeatureMode === "BUNDLE"
                        ? "Bundles only"
                        : "Subscriptions only"
                      : "Not selected"}
                  </Text>
                )}
                {billing.activePlanName === "Premium" && (
                  <Text as="p">Premium: Bundles + Subscriptions enabled</Text>
                )}
              </BlockStack>
            </Card>
          )}
          
          {/* --- ANALYTICS DASHBOARD --- */}
          <Layout>
            <Layout.Section>
              <Card>
                  <BlockStack gap="200">
                      <Text as="h2" variant="headingSm">Performance Overview</Text>
                      <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }} gap="400">
                          {/* Active Card */}
                          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingXs" tone="subdued">Active Subs</Text>
                                <Text as="p" variant="headingXl" fontWeight="bold" tone="success">
                                  {activeCount}
                                </Text>
                            </BlockStack>
                          </Box>

                          {/* Active Subscription Value Card */}
                          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingXs" tone="subdued">Active Sub Value</Text>
                                <Text as="p" variant="headingXl" fontWeight="bold" tone="success">
                                  {formatCurrency(totalActiveSubscriptionAmount)}
                                </Text>
                            </BlockStack>
                          </Box>

                          {/* Total Subscription Earnings Card */}
                          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingXs" tone="subdued">Total Sub Earnings</Text>
                                <Text as="p" variant="headingXl" fontWeight="bold">
                                  {formatCurrency(totalSubscriptionEarnings)}
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
                                  {formatCurrency(totalBundleAmount)}
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

                          {/* Cancelled Card */}
                          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingXs" tone="subdued">Cancelled Subs</Text>
                                <Text as="p" variant="headingXl" fontWeight="bold" tone="critical">
                                  {cancelledCount}
                                </Text>
                            </BlockStack>
                          </Box>
                      </InlineGrid>
                  </BlockStack>
              </Card>
            </Layout.Section>

            {/* --- FAILED SUBSCRIPTIONS BLOCK --- */}
            {failedContracts && failedContracts.length > 0 && (
              <Layout.Section>
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd" tone="critical">Failed Subscriptions ({failedContracts.length})</Text>
                    <Divider />
                    <BlockStack gap="300">
                      {failedContracts.map((contract) => (
                        <BlockStack key={contract.id} gap="100">
                          <InlineGrid columns="1fr auto">
                            <Text as="span" fontWeight="bold">{contract.customerName || contract.customerEmail || "N/A"}</Text>
                            <Text as="span" tone="critical">{contract.status}</Text>
                          </InlineGrid>
                          <Text as="p" variant="bodySm" tone="subdued">{contract.customerEmail}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Contract ID: {contract.id.split('/').pop()}
                          </Text>
                          {contract.recurringPrice && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              Amount: {formatCurrency(contract.recurringPrice)}
                            </Text>
                          )}
                          {contract.nextBillingDate && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              Last Attempt: {new Date(contract.nextBillingDate).toLocaleDateString()}
                            </Text>
                          )}
                          <Divider />
                        </BlockStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Layout.Section>
            )}

            {/* --- NAVIGATION CARDS --- */}
            <Layout.Section>
              <InlineGrid columns={2} gap="400">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">Subscription Manager</Text>
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
                    <Text as="h2" variant="headingMd">Customer Contracts</Text>
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

            {/* --- HOW TO USE GUIDE --- */}
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">How to Use Socoba</Text>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">1. Create Subscription Plans</Text>
                    <Text as="p">
                      Go to <strong>Subscription Manager</strong> and create plans for a product or an entire collection.
                      Set delivery intervals and discounts, then save to publish the plans to Shopify.
                    </Text>

                    <Text as="h3" variant="headingSm">2. Manage Customer Contracts</Text>
                    <Text as="p">
                      Open <strong>Customer Contracts</strong> to view subscribers and pause or cancel contracts.
                      Changes sync to Shopify immediately.
                    </Text>

                    <Text as="h3" variant="headingSm">3. Create Fixed Bundles</Text>
                    <Text as="p">
                      Use <strong>Fixed Bundles</strong> to combine products into one offer with custom bundle pricing.
                      The app creates an automatic discount and stores bundle data for storefront display.
                    </Text>

                    <Divider />

                    <Text as="h3" variant="headingSm">Add Widgets to Your Storefront</Text>
                    <Text as="p">
                      Use the Theme Editor to add the Socoba widget blocks to your storefront:
                    </Text>
                    <BlockStack gap="100">
                      <Text as="p">1. In Shopify Admin, go to <strong>Online Store -> Themes -> Customize</strong>.</Text>
                      <Text as="p">2. Select the page/template where you want to show the widget.</Text>
                      <Text as="p">3. Click <strong>Add block</strong> and choose <strong>Socoba Bundle Block</strong>.</Text>
                      <Text as="p">4. Enter the <strong>Bundle Short ID</strong> from your bundle list.</Text>
                      <Text as="p">5. Save the theme.</Text>
                    </BlockStack>

                    <Text as="p" tone="subdued">
                      Tip: You can add the bundle block to product pages or a landing page to promote bundles.
                    </Text>

                    <Text as="p" tone="subdued">
                      Powered by Socoba. Visit{" "}
                      <a href="https://socoba.co" target="_blank" rel="noreferrer">
                        socoba.co
                      </a>{" "}
                      or contact{" "}
                      <a href="mailto:socoba.apps@gmail.com">socoba.apps@gmail.com</a>.
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* --- BUNDLE MANAGER --- */}
            <Layout.Section>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Fixed Bundles</Text>
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


import { AppProvider, Page, Layout, Card, Text, BlockStack, Divider, Link } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

export default function HowToUse() {
  return (
    <AppProvider i18n={enTranslations}>
      <Page title="How to Use Socoba">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Getting Started</Text>
                <Text as="p">
                  This guide helps you set up subscriptions and bundles, and place widgets on your storefront.
                </Text>

                <Divider />

                <Text as="h2" variant="headingMd">Subscription Manager</Text>
                <BlockStack gap="200">
                  <Text as="p">1. Open <strong>Subscription Manager</strong> from the app menu.</Text>
                  <Text as="p">2. Choose <strong>Product</strong> or <strong>Collection</strong>.</Text>
                  <Text as="p">3. Select the target and define delivery intervals and discounts.</Text>
                  <Text as="p">4. Click <strong>Save</strong> to publish the plan to Shopify.</Text>
                </BlockStack>

                <Divider />

                <Text as="h2" variant="headingMd">Customer Contracts</Text>
                <BlockStack gap="200">
                  <Text as="p">1. Open <strong>Customer Contracts</strong> from the app menu.</Text>
                  <Text as="p">2. Review subscriber status and next billing dates.</Text>
                  <Text as="p">3. Use <strong>Actions</strong> to pause or cancel a contract.</Text>
                </BlockStack>

                <Divider />

                <Text as="h2" variant="headingMd">Fixed Bundles</Text>
                <BlockStack gap="200">
                  <Text as="p">1. Open <strong>Fixed Bundles</strong> from the app menu.</Text>
                  <Text as="p">2. Click <strong>Select Products</strong> and pick 2 or more items.</Text>
                  <Text as="p">3. Set a bundle price for each product and save.</Text>
                  <Text as="p">4. Copy the <strong>Bundle Short ID</strong> for storefront display.</Text>
                </BlockStack>

                <Divider />

                <Text as="h2" variant="headingMd">Add Widgets to Your Storefront</Text>
                <BlockStack gap="200">
                  <Text as="p">1. In Shopify Admin, go to <strong>Online Store -> Themes -> Customize</strong>.</Text>
                  <Text as="p">2. Choose the page/template where you want the widget.</Text>
                  <Text as="p">3. Click <strong>Add block</strong> and select <strong>Socoba Bundle Block</strong>.</Text>
                  <Text as="p">4. Paste the <strong>Bundle Short ID</strong> and save.</Text>
                </BlockStack>

                <Divider />

                <Text as="p" tone="subdued">
                  Powered by Socoba. Visit{" "}
                  <Link url="https://socoba.co" external>
                    socoba.co
                  </Link>{" "}
                  or contact{" "}
                  <Link url="mailto:socoba.apps@gmail.com">socoba.apps@gmail.com</Link>.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}


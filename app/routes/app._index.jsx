import { useEffect } from "react";
import { useFetcher, Link, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { 
  Card, 
  Layout, 
  Text, 
  BlockStack, 
  InlineGrid, 
  Box 
} from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // 1. FETCH SUBSCRIPTION STATS
  // We fetch the first 200 IDs to get a count. 
  // (For massive scale, you would use webhooks, but this is perfect for starting out)
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
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();
  const product = responseJson.data.productCreate.product;
  const variantId = product.variants.edges[0].node.id;
  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyReactRouterTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );
  const variantResponseJson = await variantResponse.json();

  return {
    product: responseJson.data.productCreate.product,
    variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
  };
};

export default function Index() {
  const { activeCount, cancelledCount, pausedCount } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.product?.id) {
      shopify.toast.show("Product created");
    }
  }, [fetcher.data?.product?.id, shopify]);
  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="Shopify app template">
      
      {/* --- NEW: ANALYTICS DASHBOARD --- */}
      <s-section heading="📊 Dashboard Overview">
        <Box paddingBlockEnd="400">
          <InlineGrid columns={3} gap="400">
            {/* Active Card */}
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm" fontWeight="regular" tone="subdued">
                  Active Subscribers
                </Text>
                <Text as="p" variant="headingxl" fontWeight="bold" tone="success">
                  {activeCount}
                </Text>
              </BlockStack>
            </Card>

            {/* Cancelled Card */}
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm" fontWeight="regular" tone="subdued">
                  Cancelled
                </Text>
                <Text as="p" variant="headingxl" fontWeight="bold" tone="critical">
                  {cancelledCount}
                </Text>
              </BlockStack>
            </Card>

             {/* Paused Card */}
             <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm" fontWeight="regular" tone="subdued">
                  Paused
                </Text>
                <Text as="p" variant="headingxl" fontWeight="bold" tone="caution">
                  {pausedCount}
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Box>
      </s-section>
      
      {/* EXISTING SUBSCRIPTION MANAGER LINK */}
      <s-section heading="📦 Subscription Manager">
        <s-paragraph>
          Manage subscription plans for your products. Set different pricing for 1, 2, and 3-month subscriptions.
        </s-paragraph>
        <Link to="/app/subscriptions" style={{ textDecoration: 'none' }}>
          <s-button variant="primary">
            Manage Subscriptions
          </s-button>
        </Link>
      </s-section>

      {/* TEMPLATE STUFF BELOW */}
      <s-button slot="primary-action" onClick={generateProduct}>
        Generate a product
      </s-button>

      <s-section heading="Congrats on creating a new Shopify app 🎉">
        <s-paragraph>
          This embedded app template uses{" "}
          <s-link
            href="https://shopify.dev/docs/apps/tools/app-bridge"
            target="_blank"
          >
            App Bridge
          </s-link>{" "}
          interface examples like an{" "}
          <s-link href="/app/additional">additional page in the app nav</s-link>
          , as well as an{" "}
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql"
            target="_blank"
          >
            Admin GraphQL
          </s-link>{" "}
          mutation demo, to provide a starting point for app development.
        </s-paragraph>
      </s-section>
      <s-section heading="Get started with products">
        <s-paragraph>
          Generate a product with GraphQL and get the JSON output for that
          product. Learn more about the{" "}
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate"
            target="_blank"
          >
            productCreate
          </s-link>{" "}
          mutation in our API references.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button
            onClick={generateProduct}
            {...(isLoading ? { loading: true } : {})}
          >
            Generate a product
          </s-button>
          {fetcher.data?.product && (
            <s-button
              onClick={() => {
                shopify.intents.invoke?.("edit:shopify/Product", {
                  value: fetcher.data?.product?.id,
                });
              }}
              target="_blank"
              variant="tertiary"
            >
              Edit product
            </s-button>
          )}
        </s-stack>
        {fetcher.data?.product && (
          <s-section heading="productCreate mutation">
            <s-stack direction="block" gap="base">
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <pre style={{ margin: 0 }}>
                  <code>{JSON.stringify(fetcher.data.product, null, 2)}</code>
                </pre>
              </s-box>

              <s-heading>productVariantsBulkUpdate mutation</s-heading>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <pre style={{ margin: 0 }}>
                  <code>{JSON.stringify(fetcher.data.variant, null, 2)}</code>
                </pre>
              </s-box>
            </s-stack>
          </s-section>
        )}
      </s-section>

      <s-section slot="aside" heading="App template specs">
        <s-paragraph>
          <s-text>Framework: </s-text>
          <s-link href="https://reactrouter.com/" target="_blank">
            React Router
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Interface: </s-text>
          <s-link
            href="https://shopify.dev/docs/api/app-home/using-polaris-components"
            target="_blank"
          >
            Polaris web components
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>API: </s-text>
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql"
            target="_blank"
          >
            GraphQL
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Database: </s-text>
          <s-link href="https://www.prisma.io/" target="_blank">
            Prisma
          </s-link>
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Next steps">
        <s-unordered-list>
          <s-list-item>
            Build an{" "}
            <s-link
              href="https://shopify.dev/docs/apps/getting-started/build-app-example"
              target="_blank"
            >
              example app
            </s-link>
          </s-list-item>
          <s-list-item>
            Explore Shopify&apos;s API with{" "}
            <s-link
              href="https://shopify.dev/docs/apps/tools/graphiql-admin-api"
              target="_blank"
            >
              GraphiQL
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
import { useEffect } from "react";
import { useFetcher, Link, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineGrid,
  Box,
  List,
  ListItem,
  Link as PolarisLink,
  Banner,
  CodeBlock
} from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // 1. FETCH SUBSCRIPTION STATS
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
    <Page title="Shopify App Template">
      <BlockStack gap="500">
        
        {/* --- ANALYTICS DASHBOARD --- */}
        <Layout>
          <Layout.Section>
            <Card>
                <BlockStack gap="200">
                    <Text as="h2" variant="headingSm">Dashboard Overview</Text>
                    <InlineGrid columns={3} gap="400">
                        {/* Active Card */}
                        <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                        <BlockStack gap="200">
                            <Text as="h3" variant="headingXs" tone="subdued">Active Subscribers</Text>
                            <Text as="p" variant="headingXl" fontWeight="bold" tone="success">
                            {activeCount}
                            </Text>
                        </BlockStack>
                        </Box>

                        {/* Cancelled Card */}
                        <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                        <BlockStack gap="200">
                            <Text as="h3" variant="headingXs" tone="subdued">Cancelled</Text>
                            <Text as="p" variant="headingXl" fontWeight="bold" tone="critical">
                            {cancelledCount}
                            </Text>
                        </BlockStack>
                        </Box>

                        {/* Paused Card */}
                        <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                        <BlockStack gap="200">
                            <Text as="h3" variant="headingXs" tone="subdued">Paused</Text>
                            <Text as="p" variant="headingXl" fontWeight="bold" tone="caution">
                            {pausedCount}
                            </Text>
                        </BlockStack>
                        </Box>
                    </InlineGrid>
                </BlockStack>
            </Card>
          </Layout.Section>

          {/* --- SUBSCRIPTION MANAGER LINK --- */}
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">📦 Subscription Manager</Text>
                <Text as="p">
                  Manage subscription plans for your products. Set different pricing for 1, 2, and 3-month subscriptions.
                </Text>
                <InlineGrid>
                    <Link to="/app/subscriptions">
                    <Button variant="primary">Manage Subscriptions</Button>
                    </Link>
                </InlineGrid>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* --- TEMPLATE ACTIONS --- */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Product Generator</Text>
                <Text as="p">
                  Generate a product with GraphQL and get the JSON output for that product. 
                  Learn more about the <PolarisLink url="https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate" target="_blank">productCreate</PolarisLink> mutation.
                </Text>
                
                <InlineGrid gap="300" columns={2}>
                  <Button 
                    loading={isLoading} 
                    onClick={generateProduct}
                  >
                    Generate a product
                  </Button>
                  
                  {fetcher.data?.product && (
                    <Button
                      variant="plain"
                      onClick={() => {
                        shopify.intents.invoke?.("edit:shopify/Product", {
                          value: fetcher.data?.product?.id,
                        });
                      }}
                    >
                      Edit product
                    </Button>
                  )}
                </InlineGrid>

                {fetcher.data?.product && (
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Result</Text>
                    <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                       <pre style={{margin: 0, overflowX: "scroll"}}>
                           {JSON.stringify(fetcher.data.product, null, 2)}
                       </pre>
                    </Box>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
          
          {/* --- SIDEBAR --- */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
                <Card>
                    <BlockStack gap="200">
                        <Text as="h2" variant="headingMd">App template specs</Text>
                        <BlockStack gap="200">
                            <InlineGrid columns="1fr auto">
                                <Text as="span" fontWeight="bold">Framework</Text>
                                <PolarisLink url="https://reactrouter.com/" target="_blank">React Router</PolarisLink>
                            </InlineGrid>
                            <InlineGrid columns="1fr auto">
                                <Text as="span" fontWeight="bold">Interface</Text>
                                <PolarisLink url="https://polaris.shopify.com" target="_blank">Polaris</PolarisLink>
                            </InlineGrid>
                            <InlineGrid columns="1fr auto">
                                <Text as="span" fontWeight="bold">API</Text>
                                <PolarisLink url="https://shopify.dev/docs/api/admin-graphql" target="_blank">GraphQL</PolarisLink>
                            </InlineGrid>
                        </BlockStack>
                    </BlockStack>
                </Card>
                <Card>
                    <BlockStack gap="200">
                        <Text as="h2" variant="headingMd">Next steps</Text>
                        <List>
                            <ListItem>
                                Build an <PolarisLink url="https://shopify.dev/docs/apps/getting-started/build-app-example" target="_blank">example app</PolarisLink>
                            </ListItem>
                            <ListItem>
                                Explore API with <PolarisLink url="https://shopify.dev/docs/apps/tools/graphiql-admin-api" target="_blank">GraphiQL</PolarisLink>
                            </ListItem>
                        </List>
                    </BlockStack>
                </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
import { useEffect } from "react";
import { useFetcher, Link, useLoaderData } from "react-router-dom";
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
  Link as PolarisLink,
  Banner,
} from "@shopify/polaris";

/**
 * Helper to count all subscription contracts for a given status, using pagination.
 * This avoids the "first: 200" cap silently undercounting.
 */
async function countSubscriptionContracts(admin, status) {
  let count = 0;
  let hasNextPage = true;
  let after = null;

  while (hasNextPage) {
    const res = await admin.graphql(
      `#graphql
      query CountSubscriptionContracts($first: Int!, $after: String, $query: String!) {
        subscriptionContracts(first: $first, after: $after, query: $query) {
          edges { node { id } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      {
        variables: {
          first: 200,
          after,
          query: `status:${status}`,
        },
      },
    );

    const json = await res.json();

    if (json.errors || !json.data?.subscriptionContracts) {
      const msg =
        json.errors?.map((e) => e.message).join(", ") ||
        "Unknown GraphQL error while fetching subscription contracts.";
      throw new Error(msg);
    }

    const conn = json.data.subscriptionContracts;
    count += conn.edges.length;
    hasNextPage = conn.pageInfo.hasNextPage;
    after = conn.pageInfo.endCursor;
  }

  return count;
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    const [activeCount, cancelledCount, pausedCount] = await Promise.all([
      countSubscriptionContracts(admin, "ACTIVE"),
      countSubscriptionContracts(admin, "CANCELLED"),
      countSubscriptionContracts(admin, "PAUSED"),
    ]);

    return {
      activeCount,
      cancelledCount,
      pausedCount,
      statsError: null,
    };
  } catch (error) {
    console.error("Loader error (subscription stats):", error);
    return {
      activeCount: 0,
      cancelledCount: 0,
      pausedCount: 0,
      statsError:
        error instanceof Error ? error.message : "Failed to load stats.",
    };
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    const color = ["Red", "Orange", "Yellow", "Green"][
      Math.floor(Math.random() * 4)
    ];

    const createRes = await admin.graphql(
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
          userErrors {
            field
            message
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

    const createJson = await createRes.json();

    if (createJson.errors) {
      return {
        ok: false,
        error: createJson.errors.map((e) => e.message).join(", "),
      };
    }

    const userErrors = createJson.data?.productCreate?.userErrors || [];
    const product = createJson.data?.productCreate?.product || null;

    if (userErrors.length) {
      return {
        ok: false,
        error: userErrors.map((e) => e.message).join(", "),
        userErrors,
      };
    }

    if (!product?.id) {
      return {
        ok: false,
        error: "Product creation failed, no product returned.",
      };
    }

    const firstVariantId = product.variants?.edges?.[0]?.node?.id;
    if (!firstVariantId) {
      return {
        ok: false,
        error: "Product created, but no variant was returned to update.",
        product,
      };
    }

    const updateRes = await admin.graphql(
      `#graphql
      mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
            barcode
            createdAt
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          productId: product.id,
          variants: [{ id: firstVariantId, price: "100.00" }],
        },
      },
    );

    const updateJson = await updateRes.json();

    if (updateJson.errors) {
      return {
        ok: false,
        error: updateJson.errors.map((e) => e.message).join(", "),
        product,
      };
    }

    const updateUserErrors =
      updateJson.data?.productVariantsBulkUpdate?.userErrors || [];

    if (updateUserErrors.length) {
      return {
        ok: false,
        error: updateUserErrors.map((e) => e.message).join(", "),
        userErrors: updateUserErrors,
        product,
      };
    }

    const variant =
      updateJson.data?.productVariantsBulkUpdate?.productVariants || [];

    return {
      ok: true,
      product,
      variant,
    };
  } catch (error) {
    console.error("Action error (create/update product):", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Unexpected action failure.",
    };
  }
};

export default function Index() {
  const { activeCount, cancelledCount, pausedCount, statsError } =
    useLoaderData();

  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data?.product?.id) {
      shopify.toast?.show?.("Product created");
    }
    if (!fetcher.data?.ok && fetcher.data?.error) {
      shopify.toast?.show?.(fetcher.data.error);
    }
  }, [fetcher.data, shopify]);

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <Page title="Shopify App Template">
      <BlockStack gap="500">
        {statsError ? (
          <Banner tone="warning" title="Stats could not be loaded">
            <p>
              {statsError}
              <br />
              If this is a new app install, check that your app has the required
              Admin API access and scopes for subscriptions.
            </p>
          </Banner>
        ) : null}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  Dashboard Overview
                </Text>

                <InlineGrid columns={3} gap="400">
                  <Box
                    background="bg-surface-secondary"
                    padding="400"
                    borderRadius="200"
                  >
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingXs" tone="subdued">
                        Active Subscribers
                      </Text>
                      <Text as="p" variant="headingXl" fontWeight="bold" tone="success">
                        {activeCount}
                      </Text>
                    </BlockStack>
                  </Box>

                  <Box
                    background="bg-surface-secondary"
                    padding="400"
                    borderRadius="200"
                  >
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingXs" tone="subdued">
                        Cancelled
                      </Text>
                      <Text as="p" variant="headingXl" fontWeight="bold" tone="critical">
                        {cancelledCount}
                      </Text>
                    </BlockStack>
                  </Box>

                  <Box
                    background="bg-surface-secondary"
                    padding="400"
                    borderRadius="200"
                  >
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingXs" tone="subdued">
                        Paused
                      </Text>
                      <Text as="p" variant="headingXl" fontWeight="bold" tone="caution">
                        {pausedCount}
                      </Text>
                    </BlockStack>
                  </Box>
                </InlineGrid>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  📦 Subscription Manager
                </Text>
                <Text as="p">
                  Manage subscription plans for your products. Set different
                  pricing for 1, 2, and 3-month subscriptions.
                </Text>

                <Button variant="primary" url="/app/subscriptions">
                  Manage Subscriptions
                </Button>

                {/* If you prefer internal navigation via router Link, keep this instead:
                <Link to="/app/subscriptions">
                  <Button variant="primary">Manage Subscriptions</Button>
                </Link>
                */}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Product Generator
                </Text>

                <Text as="p">
                  Generate a product with GraphQL and get the JSON output for
                  that product. Learn more about the{" "}
                  <PolarisLink
                    url="https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate"
                    target="_blank"
                  >
                    productCreate
                  </PolarisLink>{" "}
                  mutation.
                </Text>

                <InlineGrid gap="300" columns={2}>
                  <Button loading={isLoading} onClick={generateProduct}>
                    Generate a product
                  </Button>

                  {fetcher.data?.ok && fetcher.data?.product?.id ? (
                    <Button
                      variant="plain"
                      onClick={() => {
                        shopify.intents?.invoke?.("edit:shopify/Product", {
                          value: fetcher.data.product.id,
                        });
                      }}
                    >
                      Edit product
                    </Button>
                  ) : null}
                </InlineGrid>

                {fetcher.data?.ok && fetcher.data?.product ? (
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Result
                    </Text>
                    <Box
                      padding="200"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <pre style={{ margin: 0, overflowX: "auto" }}>
                        {JSON.stringify(fetcher.data.product, null, 2)}
                      </pre>
                    </Box>
                  </BlockStack>
                ) : null}

                {!fetcher.data?.ok && fetcher.data?.error ? (
                  <Banner tone="critical" title="Request failed">
                    <p>{fetcher.data.error}</p>
                  </Banner>
                ) : null}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    App template specs
                  </Text>
                  <BlockStack gap="200">
                    <InlineGrid columns="1fr auto">
                      <Text as="span" fontWeight="bold">
                        Framework
                      </Text>
                      <PolarisLink url="https://reactrouter.com/" target="_blank">
                        React Router
                      </PolarisLink>
                    </InlineGrid>

                    <InlineGrid columns="1fr auto">
                      <Text as="span" fontWeight="bold">
                        Interface
                      </Text>
                      <PolarisLink url="https://polaris.shopify.com" target="_blank">
                        Polaris
                      </PolarisLink>
                    </InlineGrid>

                    <InlineGrid columns="1fr auto">
                      <Text as="span" fontWeight="bold">
                        API
                      </Text>
                      <PolarisLink
                        url="https://shopify.dev/docs/api/admin-graphql"
                        target="_blank"
                      >
                        GraphQL
                      </PolarisLink>
                    </InlineGrid>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Next steps
                  </Text>
                  <List>
                    <List.Item>
                      Build an{" "}
                      <PolarisLink
                        url="https://shopify.dev/docs/apps/getting-started/build-app-example"
                        target="_blank"
                      >
                        example app
                      </PolarisLink>
                    </List.Item>
                    <List.Item>
                      Explore API with{" "}
                      <PolarisLink
                        url="https://shopify.dev/docs/apps/tools/graphiql-admin-api"
                        target="_blank"
                      >
                        GraphiQL
                      </PolarisLink>
                    </List.Item>
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

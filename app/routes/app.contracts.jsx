import { json } from "@react-router/node";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import {
  AppProvider, Page, Layout, Card, IndexTable, Text, Badge, 
  Button, EmptyState, Box
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { TitleBar } from "@shopify/app-bridge-react";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
    query GetContracts($first: Int!) {
      subscriptionContracts(first: $first, reverse: true) {
        edges {
          node {
            id
            status
            nextBillingDate
            customer { displayName email }
            lines(first: 3) { edges { node { title quantity } } }
          }
        }
      }
    }`,
    { variables: { first: 20 } }
  );

  const jsonResponse = await response.json();
  return json({ contracts: jsonResponse.data?.subscriptionContracts?.edges || [] });
}

export default function Contracts() {
  const { contracts } = useLoaderData();
  const fetcher = useFetcher();

  const rowMarkup = contracts.map(({ node }, index) => (
    <IndexTable.Row id={node.id} key={node.id} position={index}>
      <IndexTable.Cell>
        <Text fontWeight="bold" as="span">{node.customer?.displayName}</Text>
        <Box><Text variant="bodySm" tone="subdued">{node.customer?.email}</Text></Box>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {node.lines.edges.map((l, i) => <div key={i}>{l.node.quantity} x {l.node.title}</div>)}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={node.status === 'ACTIVE' ? 'success' : 'attention'}>{node.status}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {node.nextBillingDate ? new Date(node.nextBillingDate).toLocaleDateString() : "N/A"}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppProvider i18n={enTranslations}>
      <Page>
        <TitleBar title="Customer Contracts" />
        <Layout>
          <Layout.Section>
            <Card padding="0">
              {contracts.length === 0 ? (
                <EmptyState heading="No contracts found" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png" />
              ) : (
                <IndexTable
                  resourceName={{ singular: 'contract', plural: 'contracts' }}
                  itemCount={contracts.length}
                  headings={[
                    { title: 'Customer' },
                    { title: 'Products' },
                    { title: 'Status' },
                    { title: 'Next Billing' },
                  ]}
                  selectable={false}
                >
                  {rowMarkup}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}
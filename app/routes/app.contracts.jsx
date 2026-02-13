import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import {
  AppProvider, Page, Layout, Card, IndexTable, Text, Badge, 
  Button, EmptyState, Box, Popover, ActionList
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState, useCallback } from "react";

// --- GraphQL Mutations ---
const SUBSCRIPTION_CONTRACT_UPDATE_MUTATION = `#graphql
  mutation subscriptionContractUpdate($contractId: ID!) {
    subscriptionContractUpdate(contractId: $contractId) {
      draft {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const SUBSCRIPTION_DRAFT_UPDATE_MUTATION = `#graphql
  mutation subscriptionDraftUpdate($draftId: ID!, $input: SubscriptionDraftInput!) {
    subscriptionDraftUpdate(draftId: $draftId, input: $input) {
      draft {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const SUBSCRIPTION_DRAFT_COMMIT_MUTATION = `#graphql
  mutation subscriptionDraftCommit($draftId: ID!) {
    subscriptionDraftCommit(draftId: $draftId) {
      contract {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// --- LOADER ---
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
  return Response.json({ contracts: jsonResponse.data?.subscriptionContracts?.edges || [] });
}

// --- ACTION ---
export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const contractId = formData.get("contractId");
  const intent = formData.get("intent"); // "pause" or "cancel"
  let newStatus;

  switch (intent) {
    case "pause":
      newStatus = "PAUSED";
      break;
    case "cancel":
      newStatus = "CANCELLED";
      break;
    default:
      return new Response("Invalid intent", { status: 400 });
  }

  try {
    // 1. Create a draft
    const updateResponse = await admin.graphql(SUBSCRIPTION_CONTRACT_UPDATE_MUTATION, {
      variables: { contractId: contractId },
    });
    const updateJson = await updateResponse.json();

    if (updateJson.errors || updateJson.data.subscriptionContractUpdate.userErrors.length > 0) {
      console.error("Error creating draft:", updateJson.errors || updateJson.data.subscriptionContractUpdate.userErrors);
      return new Response("Error creating draft", { status: 500 });
    }
    const draftId = updateJson.data.subscriptionContractUpdate.draft.id;

    // 2. Update the draft's status
    const draftUpdateResponse = await admin.graphql(SUBSCRIPTION_DRAFT_UPDATE_MUTATION, {
      variables: {
        draftId: draftId,
        input: { status: newStatus },
      },
    });
    const draftUpdateJson = await draftUpdateResponse.json();

    if (draftUpdateJson.errors || draftUpdateJson.data.subscriptionDraftUpdate.userErrors.length > 0) {
      console.error("Error updating draft status:", draftUpdateJson.errors || draftUpdateJson.data.subscriptionDraftUpdate.userErrors);
      return new Response("Error updating draft status", { status: 500 });
    }

    // 3. Commit the draft
    const commitResponse = await admin.graphql(SUBSCRIPTION_DRAFT_COMMIT_MUTATION, {
      variables: { draftId: draftId },
    });
    const commitJson = await commitResponse.json();

    if (commitJson.errors || commitJson.data.subscriptionDraftCommit.userErrors.length > 0) {
      console.error("Error committing draft:", commitJson.errors || commitJson.data.subscriptionDraftCommit.userErrors);
      return new Response("Error committing draft", { status: 500 });
    }

    return new Response("Contract updated successfully", { status: 200 });

  } catch (error) {
    console.error("Unhandled error in action:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

// --- COMPONENT ---
export default function Contracts() {
  const { contracts } = useLoaderData();
  const fetcher = useFetcher();

  const [popoverActive, setPopoverActive] = useState(null); // Stores ID of contract for which popover is active

  const togglePopoverActive = useCallback((id) => {
    setPopoverActive(popoverActive === id ? null : id);
  }, [popoverActive]);

  const handleAction = (contractId, intent) => {
    togglePopoverActive(contractId); // Close popover immediately
    fetcher.submit(
      { contractId, intent },
      { method: "post", action: "/app/contracts" }
    );
  };

  const rowMarkup = contracts.map(({ node }, index) => {
    const isLoading = fetcher.state === "submitting" && fetcher.formData?.get("contractId") === node.id;

    return (
      <IndexTable.Row id={node.id} key={node.id} position={index}>
        <IndexTable.Cell>
          <Text fontWeight="bold" as="span">{node.customer?.displayName}</Text>
          <Box><Text variant="bodySm" tone="subdued">{node.customer?.email}</Text></Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {node.lines.edges.map((l, i) => <div key={i}>{l.node.quantity} x {l.node.title}</div>)}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={node.status === 'ACTIVE' ? 'success' : (node.status === 'FAILED' ? 'critical' : 'attention')}>{node.status}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {node.nextBillingDate ? new Date(node.nextBillingDate).toLocaleDateString() : "N/A"}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Popover
            active={popoverActive === node.id}
            onClose={() => togglePopoverActive(node.id)}
            activator={<Button onClick={() => togglePopoverActive(node.id)} primary={false} disclosure disabled={isLoading}>Actions</Button>}
            preferredAlignment="right"
          >
            <ActionList
              actionRole="menuitem"
              items={[
                {
                  content: 'Pause',
                  onAction: () => handleAction(node.id, 'pause'),
                  disabled: isLoading || node.status === 'PAUSED' || node.status === 'CANCELLED',
                },
                {
                  content: 'Cancel',
                  onAction: () => handleAction(node.id, 'cancel'),
                  disabled: isLoading || node.status === 'CANCELLED',
                  tone: 'critical',
                },
              ]}
            />
          </Popover>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

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
                    { title: 'Actions' },
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
// 1. REMOVED the broken 'json' import
import { useLoaderData, useSubmit } from "react-router";
import { authenticate } from "../shopify.server";
import {
  Card, Text, Button, Badge, BlockStack, InlineStack
} from "@shopify/polaris";

// 2. LOADER: Get Customer's Contracts
export async function loader({ request }) {
  const { admin } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const customerId = url.searchParams.get("logged_in_customer_id");

  if (!customerId) {
    // FIX: Use Response.json() instead of json()
    return Response.json({ customer: null, contracts: [] });
  }

  const response = await admin.graphql(
    `#graphql
    query getCustomerContracts($id: ID!) {
      customer(id: $id) {
        firstName
        subscriptionContracts(first: 10) {
          nodes {
            id
            status
            nextBillingDate
            lines(first: 5) {
               edges { node { title } }
            }
            billingPolicy {
              interval
              intervalCount
            }
          }
        }
      }
    }`,
    { variables: { id: `gid://shopify/Customer/${customerId}` } }
  );

  const responseJson = await response.json();
  const customer = responseJson.data.customer;

  // FIX: Use Response.json()
  return Response.json({ 
    customer: customer, 
    contracts: customer?.subscriptionContracts?.nodes || [] 
  });
}

// 3. ACTION: Handle Cancellation
export async function action({ request }) {
  const { admin } = await authenticate.public.appProxy(request);
  const formData = await request.formData();
  const contractId = formData.get("contractId");

  if (!contractId) return Response.json({ error: "No ID" });

  try {
    const response = await admin.graphql(
      `#graphql
      mutation cancelContract($contractId: ID!) {
        subscriptionContractCancel(subscriptionContractId: $contractId) {
          contract {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }`,
      { variables: { contractId } }
    );
    
    const responseJson = await response.json();
    const errors = responseJson.data.subscriptionContractCancel.userErrors;
    
    if (errors.length > 0) {
      return Response.json({ error: errors[0].message });
    }
    
    return Response.json({ success: true });

  } catch (err) {
    return Response.json({ error: "Server Error" });
  }
}

// 4. UI: The Page the Customer Sees
export default function CustomerPortal() {
  const { customer, contracts } = useLoaderData();
  const submit = useSubmit();

  if (!customer) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <Text variant="headingMd">Please Log In</Text>
        <p>You must be logged into your store account to view subscriptions.</p>
        <br />
        <a href="/account/login" style={{ textDecoration: "underline", color: "blue" }}>Go to Login</a>
      </div>
    );
  }

  const handleCancel = (contractId) => {
    if(confirm("Are you sure you want to cancel this subscription?")) {
      submit({ contractId }, { method: "POST" });
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
      <BlockStack gap="500">
        <Text variant="headingLg" as="h1">Hello, {customer.firstName}</Text>
        <Text variant="bodyMd">Manage your active subscriptions below.</Text>

        {contracts.length === 0 ? (
           <Card>
             <div style={{textAlign: "center", padding: "20px"}}>
               <Text tone="subdued">You have no active subscriptions.</Text>
               <br />
               <a href="/collections/all" style={{ padding: "10px 20px", background: "black", color: "white", textDecoration: "none", borderRadius: "5px"}}>Start Shopping</a>
             </div>
           </Card>
        ) : (
          contracts.map(contract => (
            <Card key={contract.id}>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd">
                     {contract.lines.edges[0]?.node.title || "Subscription"}
                  </Text>
                  <Badge tone={contract.status === 'ACTIVE' ? 'success' : 'critical'}>
                    {contract.status}
                  </Badge>
                </InlineStack>

                <Text>
                  <strong>Frequency:</strong> Every {contract.billingPolicy.intervalCount} {contract.billingPolicy.interval.toLowerCase()}(s)
                </Text>
                
                {contract.status === 'ACTIVE' && (
                  <Text>
                    <strong>Next Charge:</strong> {new Date(contract.nextBillingDate).toDateString()}
                  </Text>
                )}

                {contract.status === 'ACTIVE' && (
                  <div style={{ marginTop: "10px" }}>
                    <Button tone="critical" onClick={() => handleCancel(contract.id)}>
                      Cancel Subscription
                    </Button>
                  </div>
                )}
              </BlockStack>
            </Card>
          ))
        )}
      </BlockStack>
    </div>
  );
}
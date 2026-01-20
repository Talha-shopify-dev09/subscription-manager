import { useEffect } from "react";
import { useLoaderData, useSubmit, useActionData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";

// 1. SAFE LOADER
export async function loader({ request }) {
  try {
    const { admin } = await authenticate.public.appProxy(request);
    
    const url = new URL(request.url);
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!customerId) {
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

    if (responseJson.errors) {
       console.error("GraphQL Errors:", responseJson.errors);
       return Response.json({ customer: null, contracts: [], error: JSON.stringify(responseJson.errors) });
    }

    const customer = responseJson.data?.customer;

    return Response.json({ 
      customer: customer || null, 
      contracts: customer?.subscriptionContracts?.nodes || [] 
    });

  } catch (error) {
    console.error("Portal Loader Error:", error);
    return Response.json({ customer: null, contracts: [], error: error.message });
  }
}

// 2. SAFE ACTION (With Logging)
export async function action({ request }) {
  try {
    const { admin } = await authenticate.public.appProxy(request);
    const formData = await request.formData();
    const contractId = formData.get("contractId");

    console.log("🔄 Attempting to cancel contract:", contractId);

    if (!contractId) return Response.json({ error: "No Contract ID provided" });

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
    console.log("✅ Shopify Response:", JSON.stringify(responseJson));

    // Check for Top-Level Errors (Missing Scopes, etc)
    if (responseJson.errors) {
        return Response.json({ error: "API Error: " + JSON.stringify(responseJson.errors) });
    }

    // Check for User Errors (Business Logic, e.g., "Already cancelled")
    const userErrors = responseJson.data.subscriptionContractCancel.userErrors;
    if (userErrors.length > 0) {
        return Response.json({ error: userErrors[0].message });
    }
    
    return Response.json({ success: true });

  } catch (err) {
    console.error("🔥 Action Crash:", err);
    return Response.json({ error: "Action Error: " + err.message });
  }
}

// 3. UI COMPONENT
export default function CustomerPortal() {
  const data = useLoaderData();
  const actionData = useActionData(); // <--- NEW: Listens for success/failure
  const submit = useSubmit();
  const navigation = useNavigation();

  const isLoading = navigation.state === "submitting";

  // Alert the user if the action failed or succeeded
  useEffect(() => {
      if (actionData?.error) {
          alert("Failed to cancel: " + actionData.error);
      } else if (actionData?.success) {
          alert("Subscription Cancelled Successfully!");
      }
  }, [actionData]);

  if (data?.error) {
    return (
      <div style={{ padding: "20px", color: "red", border: "1px solid red" }}>
        <h3>Error Loading Portal</h3>
        <p>{data.error}</p>
      </div>
    );
  }

  const { customer, contracts } = data;

  const styles = {
    container: { maxWidth: "800px", margin: "0 auto", padding: "20px", fontFamily: "inherit" },
    header: { marginBottom: "30px", borderBottom: "1px solid #eee", paddingBottom: "10px" },
    card: { border: "1px solid #e1e1e1", borderRadius: "8px", padding: "20px", marginBottom: "20px", background: "#fff" },
    badge: (active) => ({
      display: "inline-block", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold",
      background: active ? "#d1fae5" : "#fee2e2", color: active ? "#065f46" : "#991b1b"
    }),
    btn: {
      background: "#ef4444", color: "white", border: "none", padding: "8px 16px", borderRadius: "4px",
      cursor: "pointer", fontSize: "14px", marginTop: "10px", opacity: isLoading ? 0.5 : 1
    }
  };

  if (!customer) {
    return (
      <div style={{ ...styles.container, textAlign: "center", padding: "50px 20px" }}>
        <h2>Please Log In</h2>
        <a href="/account/login">Go to Login Page</a>
      </div>
    );
  }

  const handleCancel = (contractId) => {
    if(confirm("Are you sure you want to cancel this subscription?")) {
      submit({ contractId }, { method: "POST" });
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>Hi, {customer.firstName}</h1>
        <p>Active Subscriptions</p>
      </div>

      {contracts.length === 0 ? (
         <p>No active subscriptions found.</p>
      ) : (
        contracts.map(contract => (
          <div key={contract.id} style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>
                 {contract.lines.edges[0]?.node.title || "Subscription"}
              </h3>
              <span style={styles.badge(contract.status === 'ACTIVE')}>
                {contract.status}
              </span>
            </div>

            <p>Every {contract.billingPolicy.intervalCount} {contract.billingPolicy.interval.toLowerCase()}(s)</p>
            
            {contract.status === 'ACTIVE' && (
              <button 
                style={styles.btn} 
                onClick={() => handleCancel(contract.id)}
                disabled={isLoading}
              >
                {isLoading ? "Processing..." : "Cancel Subscription"}
              </button>
            )}
            
            {/* Show error specifically for this card if needed (advanced) */}
            {actionData?.error && <p style={{color: 'red', marginTop: '10px'}}>{actionData.error}</p>}
          </div>
        ))
      )}
    </div>
  );
}
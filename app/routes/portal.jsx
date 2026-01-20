import { useLoaderData, useSubmit } from "react-router";
import { authenticate } from "../shopify.server";

// 1. SAFE LOADER
export async function loader({ request }) {
  // We wrap everything in a Try/Catch to prevent the "Third Party Error" screen
  try {
    const { admin } = await authenticate.public.appProxy(request);
    
    // Get Customer ID from URL
    const url = new URL(request.url);
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!customerId) {
      return Response.json({ customer: null, contracts: [] });
    }

    // Query Shopify
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

    // Check for GraphQL Errors inside the response
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
    // If it crashes, log it and return the REAL error message
    console.error("Portal Loader Error:", error);
    return Response.json({ 
      customer: null, 
      contracts: [], 
      error: error.message || JSON.stringify(error) 
    });
  }
}

// 2. SAFE ACTION
export async function action({ request }) {
  try {
    const { admin } = await authenticate.public.appProxy(request);
    const formData = await request.formData();
    const contractId = formData.get("contractId");

    if (!contractId) return Response.json({ error: "No ID" });

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
    
    if (errors.length > 0) return Response.json({ error: errors[0].message });
    
    return Response.json({ success: true });

  } catch (err) {
    return Response.json({ error: "Action Error: " + err.message });
  }
}

// 3. UI COMPONENT
export default function CustomerPortal() {
  const data = useLoaderData();
  const submit = useSubmit();

  // Handle case where loader crashed gracefully
  if (data?.error) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "red", border: "2px solid red", margin: "20px" }}>
        <h3>System Error</h3>
        <p><strong>Error Details:</strong> {data.error}</p>
        <p><small>Please check your shopify.app.toml scopes.</small></p>
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
      cursor: "pointer", fontSize: "14px", marginTop: "10px"
    }
  };

  if (!customer) {
    return (
      <div style={{ ...styles.container, textAlign: "center", padding: "50px 20px" }}>
        <h2>Please Log In</h2>
        <p>You must be logged into your store account to view subscriptions.</p>
        <br />
        <a href="/account/login" style={{ textDecoration: "underline" }}>Go to Login Page</a>
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
        <p>Here are your active subscriptions.</p>
      </div>

      {contracts.length === 0 ? (
         <div style={{ textAlign: "center", padding: "40px", background: "#f9fafb", borderRadius: "8px" }}>
           <h3>No Active Subscriptions</h3>
           <p>You don't have any recurring orders right now.</p>
           <a href="/collections/all" style={{ marginTop: "15px", display: "inline-block" }}>Start Shopping</a>
         </div>
      ) : (
        contracts.map(contract => (
          <div key={contract.id} style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <h3 style={{ margin: 0 }}>
                 {contract.lines.edges[0]?.node.title || "Subscription"}
              </h3>
              <span style={styles.badge(contract.status === 'ACTIVE')}>
                {contract.status}
              </span>
            </div>

            <p style={{ margin: "5px 0", color: "#666" }}>
              <strong>Frequency:</strong> Every {contract.billingPolicy.intervalCount} {contract.billingPolicy.interval.toLowerCase()}(s)
            </p>
            
            {contract.status === 'ACTIVE' && (
              <p style={{ margin: "5px 0", color: "#666" }}>
                <strong>Next Billing Date:</strong> {new Date(contract.nextBillingDate).toDateString()}
              </p>
            )}

            {contract.status === 'ACTIVE' && (
              <button style={styles.btn} onClick={() => handleCancel(contract.id)}>
                Cancel Subscription
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
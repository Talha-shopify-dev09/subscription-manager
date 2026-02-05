import { useLoaderData, useActionData, Form } from "react-router";
import { authenticate } from "../shopify.server";

// 1. LOADER
export async function loader({ request }) {
  try {
    const { admin } = await authenticate.public.appProxy(request);
    const url = new URL(request.url);
    // App Proxy adds this param automatically when a customer is logged in
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
              lines(first: 5) { edges { node { title } } }
              billingPolicy { 
                ... on SellingPlanRecurringBillingPolicy {
                  interval
                  intervalCount
                }
              }
            }
          }
        }
      }`,
      { variables: { id: `gid://shopify/Customer/${customerId}` } }
    );

    const responseJson = await response.json();
    
    // Using native Response.json() to avoid export errors
    return Response.json({ 
      customer: responseJson.data?.customer || null, 
      contracts: responseJson.data?.customer?.subscriptionContracts?.nodes || [] 
    });

  } catch (error) {
    console.error("Portal Loader Error:", error);
    return Response.json({ customer: null, contracts: [], error: "Could not load subscriptions." });
  }
}

// 2. ACTION
export async function action({ request }) {
  try {
    const { admin } = await authenticate.public.appProxy(request);
    const formData = await request.formData();
    const contractId = formData.get("contractId");

    if (!contractId) {
      return Response.json({ error: "No Contract ID provided" });
    }

    const response = await admin.graphql(
      `#graphql
      mutation cancelContract($id: ID!) {
        subscriptionContractCancel(contractId: $id) {
          contract { id status }
          userErrors { field message }
        }
      }`,
      { variables: { id: contractId } }
    );
    
    const responseJson = await response.json();
    const userErrors = responseJson.data?.subscriptionContractCancel?.userErrors || [];
    
    if (userErrors.length > 0) {
      return Response.json({ error: userErrors[0].message });
    }
    
    return Response.json({ success: true });

  } catch (err) {
    console.error("Portal Action Error:", err);
    return Response.json({ error: "Failed to cancel subscription. Please try again." });
  }
}

// 3. UI COMPONENT
export default function CustomerPortal() {
  const data = useLoaderData();
  const actionData = useActionData(); 

  const styles = {
    container: { maxWidth: "600px", margin: "40px auto", padding: "20px", fontFamily: "sans-serif", color: "#333" },
    card: { border: "1px solid #dfe3e8", borderRadius: "12px", padding: "24px", marginBottom: "20px", background: "#fff", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" },
    badge: (status) => ({
      display: "inline-block", padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "600", textTransform: "uppercase",
      background: status === 'ACTIVE' ? "#e3f9ee" : "#f4f6f8", 
      color: status === 'ACTIVE' ? "#007e33" : "#637381"
    }),
    btn: {
      background: "#d82c0d", color: "white", border: "none", padding: "10px 20px", borderRadius: "6px",
      cursor: "pointer", fontSize: "14px", fontWeight: "600", marginTop: "16px", width: "100%"
    },
    success: { padding: '15px', background: '#e3f9ee', color: '#007e33', marginBottom: '20px', borderRadius: '8px', textAlign: 'center' },
    error: { padding: '15px', background: '#fff1f0', color: '#d82c0d', marginBottom: '20px', borderRadius: '8px', textAlign: 'center' }
  };

  if (data?.error) return <div style={styles.error}>{data.error}</div>;
  
  // Handled missing customer (not logged in)
  if (!data?.customer) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p>Please log in to your store account to manage your subscriptions.</p>
        </div>
      </div>
    );
  }

  const { customer, contracts } = data;

  return (
    <div style={styles.container}>
      <h2 style={{ marginBottom: "24px" }}>Manage Subscriptions</h2>
      <p style={{ marginBottom: "32px" }}>Hello <strong>{customer.firstName}</strong>, here are your recurring orders.</p>

      {actionData?.success && <div style={styles.success}>Your subscription has been cancelled successfully.</div>}
      {actionData?.error && <div style={styles.error}>{actionData.error}</div>}

      {contracts.length === 0 ? (
        <p>You don't have any active subscriptions yet.</p>
      ) : (
        contracts.map(contract => (
          <div key={contract.id} style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "16px", fontWeight: "bold" }}>
                {contract.lines.edges[0]?.node.title || "Subscription Bundle"}
              </span>
              <span style={styles.badge(contract.status)}>{contract.status}</span>
            </div>
            
            <p style={{ color: "#637381", fontSize: "14px", margin: "4px 0" }}>
              Frequency: Every {contract.billingPolicy.intervalCount} {contract.billingPolicy.interval.toLowerCase()}(s)
            </p>
            <p style={{ color: "#637381", fontSize: "14px", margin: "4px 0" }}>
              Next Charge: {contract.nextBillingDate ? new Date(contract.nextBillingDate).toLocaleDateString() : 'N/A'}
            </p>
            
            {contract.status === 'ACTIVE' && (
              <Form method="POST">
                <input type="hidden" name="contractId" value={contract.id} />
                <button 
                  type="submit" 
                  style={styles.btn}
                  onClick={(e) => { if(!confirm("Are you sure? This cannot be undone.")) e.preventDefault(); }}
                >
                  Cancel Subscription
                </button>
              </Form>
            )}
          </div>
        ))
      )}
    </div>
  );
}
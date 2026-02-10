import { useLoaderData, useActionData, Form } from "react-router";
import { authenticate } from "../shopify.server";

// 1. HEADERS: Crucial for rendering within the Shopify Storefront Theme
export const headers = () => {
  return {
    "Content-Type": "application/liquid",
  };
};

// 2. LOADER
export async function loader({ request }) {
  try {
    const { admin } = await authenticate.public.appProxy(request);
    const url = new URL(request.url);
    // App Proxy adds this param automatically when a customer is logged in
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!customerId) {
      // FIX: Return a plain object, NOT a Response object, so the UI renders
      return { customer: null, contracts: [] };
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
                edges { 
                  node { title } 
                } 
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
    
    // FIX: Return plain data object
    return { 
      customer: responseJson.data?.customer || null, 
      contracts: responseJson.data?.customer?.subscriptionContracts?.nodes || [] 
    };

  } catch (error) {
    console.error("Portal Loader Error:", error);
    return { customer: null, contracts: [], error: "Could not load subscriptions." };
  }
}

// 3. ACTION
export async function action({ request }) {
  try {
    const { admin } = await authenticate.public.appProxy(request);
    const formData = await request.formData();
    const contractId = formData.get("contractId");

    if (!contractId) {
      return { error: "No Contract ID provided" };
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
      return { error: userErrors[0].message };
    }
    
    // FIX: Return plain success object
    return { success: true };

  } catch (err) {
    console.error("Portal Action Error:", err);
    return { error: "Failed to cancel subscription. Please try again." };
  }
}

// 4. UI COMPONENT
export default function CustomerPortal() {
  const data = useLoaderData();
  const actionData = useActionData(); 

  const styles = {
    container: { maxWidth: "800px", margin: "40px auto", padding: "0 20px", fontFamily: "var(--font-body-family)", color: "var(--color-body-text)" },
    card: { border: "1px solid #e1e3e5", borderRadius: "8px", padding: "24px", marginBottom: "20px", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" },
    title: { fontSize: "18px", fontWeight: "600", margin: 0 },
    badge: (status) => ({
      padding: "4px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: "600", textTransform: "uppercase",
      background: status === 'ACTIVE' ? "#e3f9ee" : "#f4f6f8", 
      color: status === 'ACTIVE' ? "#007e33" : "#637381"
    }),
    btn: {
      background: "#d82c0d", color: "white", border: "none", padding: "10px 20px", borderRadius: "4px",
      cursor: "pointer", fontSize: "14px", fontWeight: "600", marginTop: "16px", width: "100%", transition: "opacity 0.2s"
    },
    success: { padding: '15px', background: '#e3f9ee', color: '#007e33', marginBottom: '20px', borderRadius: '4px', textAlign: 'center' },
    error: { padding: '15px', background: '#fff1f0', color: '#d82c0d', marginBottom: '20px', borderRadius: '4px', textAlign: 'center' }
  };

  if (data?.error) return <div style={styles.error}>{data.error}</div>;
  
  // Handled missing customer (not logged in)
  if (!data?.customer) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={{ textAlign: "center" }}>Please log in to your store account to manage your subscriptions.</p>
        </div>
      </div>
    );
  }

  const { customer, contracts } = data;

  return (
    <div className="subscription-portal" style={styles.container}>
      <h2 style={{ marginBottom: "24px", fontSize: "24px" }}>My Subscriptions</h2>
      <p style={{ marginBottom: "32px", opacity: 0.8 }}>Welcome back, <strong>{customer.firstName}</strong>.</p>

      {actionData?.success && <div style={styles.success}>Your subscription has been cancelled successfully.</div>}
      {actionData?.error && <div style={styles.error}>{actionData.error}</div>}

      {contracts.length === 0 ? (
        <div style={styles.card}>
          <p style={{ textAlign: "center" }}>You don't have any active subscriptions yet.</p>
        </div>
      ) : (
        contracts.map(contract => (
          <div key={contract.id} style={styles.card}>
            <div style={styles.header}>
              <span style={styles.title}>
                {contract.lines.edges[0]?.node.title || "Subscription Bundle"}
              </span>
              <span style={styles.badge(contract.status)}>{contract.status}</span>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "16px" }}>
              <div>
                <p style={{ fontSize: "12px", color: "#666", marginBottom: "4px", textTransform: "uppercase" }}>Frequency</p>
                <p style={{ fontWeight: "500" }}>Every {contract.billingPolicy.intervalCount} {contract.billingPolicy.interval.toLowerCase()}(s)</p>
              </div>
              <div>
                <p style={{ fontSize: "12px", color: "#666", marginBottom: "4px", textTransform: "uppercase" }}>Next Billing</p>
                <p style={{ fontWeight: "500" }}>{contract.nextBillingDate ? new Date(contract.nextBillingDate).toLocaleDateString() : 'N/A'}</p>
              </div>
            </div>
            
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
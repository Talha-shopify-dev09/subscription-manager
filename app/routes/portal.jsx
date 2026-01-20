import { useLoaderData, useActionData } from "react-router";
import { authenticate } from "../shopify.server";

// 1. LOADER (Unchanged)
export async function loader({ request }) {
  try {
    const { admin } = await authenticate.public.appProxy(request);
    const url = new URL(request.url);
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!customerId) return Response.json({ customer: null, contracts: [] });

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
              billingPolicy { interval intervalCount }
            }
          }
        }
      }`,
      { variables: { id: `gid://shopify/Customer/${customerId}` } }
    );

    const responseJson = await response.json();
    return Response.json({ 
      customer: responseJson.data?.customer || null, 
      contracts: responseJson.data?.customer?.subscriptionContracts?.nodes || [] 
    });

  } catch (error) {
    return Response.json({ customer: null, contracts: [], error: error.message });
  }
}

// 2. ACTION (Unchanged)
export async function action({ request }) {
  try {
    const { admin } = await authenticate.public.appProxy(request);
    const formData = await request.formData();
    const contractId = formData.get("contractId");

    console.log("SERVER: Received cancel request for:", contractId);

    if (!contractId) return Response.json({ error: "No Contract ID" });

    const response = await admin.graphql(
      `#graphql
      mutation cancelContract($contractId: ID!) {
        subscriptionContractCancel(subscriptionContractId: $contractId) {
          contract { id status }
          userErrors { field message }
        }
      }`,
      { variables: { contractId } }
    );
    
    const responseJson = await response.json();
    
    // Handle Errors
    if (responseJson.errors) return Response.json({ error: JSON.stringify(responseJson.errors) });
    const userErrors = responseJson.data.subscriptionContractCancel.userErrors;
    if (userErrors.length > 0) return Response.json({ error: userErrors[0].message });
    
    return Response.json({ success: true });

  } catch (err) {
    console.error("Action Error:", err);
    return Response.json({ error: err.message });
  }
}

// 3. UI COMPONENT (Native HTML Form)
export default function CustomerPortal() {
  const data = useLoaderData();
  const actionData = useActionData(); 

  const styles = {
    container: { maxWidth: "800px", margin: "0 auto", padding: "20px", fontFamily: "inherit" },
    card: { border: "1px solid #e1e1e1", borderRadius: "8px", padding: "20px", marginBottom: "20px", background: "#fff" },
    badge: (active) => ({
      display: "inline-block", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold",
      background: active ? "#d1fae5" : "#fee2e2", color: active ? "#065f46" : "#991b1b"
    }),
    btn: {
      background: "#ef4444", color: "white", border: "none", padding: "8px 16px", borderRadius: "4px",
      cursor: "pointer", fontSize: "14px", marginTop: "10px"
    },
    success: { padding: '15px', background: '#d1fae5', color: '#065f46', marginBottom: '20px', borderRadius: '4px' },
    error: { padding: '15px', background: '#fee2e2', color: '#991b1b', marginBottom: '20px', borderRadius: '4px' }
  };

  if (data?.error) return <div style={{color:'red'}}>Error: {data.error}</div>;

  const { customer, contracts } = data;

  if (!customer) return <div style={styles.container}>Please log in.</div>;

  return (
    <div style={styles.container}>
      <h1>Hi, {customer.firstName}</h1>

      {/* MESSAGES */}
      {actionData?.success && <div style={styles.success}>Subscription Cancelled!</div>}
      {actionData?.error && <div style={styles.error}>Error: {actionData.error}</div>}

      {contracts.length === 0 ? <p>No active subscriptions.</p> : contracts.map(contract => (
          <div key={contract.id} style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h3>{contract.lines.edges[0]?.node.title || "Subscription"}</h3>
              <span style={styles.badge(contract.status === 'ACTIVE')}>{contract.status}</span>
            </div>
            <p>Every {contract.billingPolicy.intervalCount} {contract.billingPolicy.interval.toLowerCase()}(s)</p>
            
            {/* NATIVE FORM: This uses standard HTML. 
               It does not rely on React onClick. It CANNOT fail to submit.
            */}
            {contract.status === 'ACTIVE' && (
              <form method="POST">
                <input type="hidden" name="contractId" value={contract.id} />
                <button type="submit" style={styles.btn}>
                  Cancel Subscription
                </button>
              </form>
            )}
          </div>
        ))}
    </div>
  );
}
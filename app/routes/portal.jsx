import { useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

// 1. SAFE LOADER (Unchanged)
export async function loader({ request }) {
  try {
    const { admin } = await authenticate.public.appProxy(request);
    const url = new URL(request.url);
    const customerId = url.searchParams.get("logged_in_customer_id");

    // If no customer is logged in, return empty state
    if (!customerId) return Response.json({ customer: null, contracts: [] });

    // Fetch Contracts from Shopify
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
    const customer = responseJson.data?.customer;

    return Response.json({ 
      customer: customer || null, 
      contracts: customer?.subscriptionContracts?.nodes || [] 
    });

  } catch (error) {
    console.error("Loader Error:", error);
    return Response.json({ customer: null, contracts: [], error: error.message });
  }
}

// 2. ACTION (Handles the cancellation request)
export async function action({ request }) {
  try {
    const { admin } = await authenticate.public.appProxy(request);
    
    // Read the form data manually
    const text = await request.text();
    const params = new URLSearchParams(text);
    const contractId = params.get("contractId");

    console.log("SERVER: Received cancel request for:", contractId);

    if (!contractId) return Response.json({ success: false, error: "No Contract ID provided" });

    // Send Cancel Mutation to Shopify
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
    const userErrors = responseJson.data.subscriptionContractCancel.userErrors;
    
    if (userErrors.length > 0) {
        return Response.json({ success: false, error: userErrors[0].message });
    }
    
    return Response.json({ success: true });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return Response.json({ success: false, error: err.message });
  }
}

// 3. UI COMPONENT (Using Manual Fetch)
export default function CustomerPortal() {
  const data = useLoaderData();
  const [processingId, setProcessingId] = useState(null);

  // Styles
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
    }
  };

  // --- THE FIX: MANUAL FETCH FUNCTION ---
  const handleCancel = async (contractId) => {
    // 1. Log to prove the button works
    console.log("BROWSER: Button clicked for", contractId);

    if(!confirm("Are you sure you want to cancel this subscription?")) return;

    setProcessingId(contractId);

    try {
        // 2. Send Request to CURRENT URL
        const formData = new URLSearchParams();
        formData.append("contractId", contractId);

        console.log("BROWSER: Sending POST request...");
        
        // This bypasses React Router and talks directly to the server
        const response = await fetch(window.location.href, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString()
        });

        // 3. Handle Response
        const result = await response.json();
        console.log("BROWSER: Server replied:", result);

        if (result.success) {
            alert("Subscription Cancelled!");
            window.location.reload(); // Refresh page to update list
        } else {
            alert("Error: " + (result.error || "Unknown error"));
        }

    } catch (error) {
        console.error("BROWSER ERROR:", error);
        alert("Network Error. Check console (Right Click > Inspect > Console).");
    } finally {
        setProcessingId(null);
    }
  };

  if (data?.error) return <div style={{color:'red'}}>Error: {data.error}</div>;

  const { customer, contracts } = data;

  if (!customer) return <div style={styles.container}>Please log in.</div>;

  return (
    <div style={styles.container}>
      <h1>Hi, {customer.firstName}</h1>
      {contracts.length === 0 ? <p>No active subscriptions found.</p> : contracts.map(contract => (
          <div key={contract.id} style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h3>{contract.lines.edges[0]?.node.title || "Subscription"}</h3>
              <span style={styles.badge(contract.status === 'ACTIVE')}>{contract.status}</span>
            </div>
            <p>Every {contract.billingPolicy.intervalCount} {contract.billingPolicy.interval.toLowerCase()}(s)</p>
            
            {contract.status === 'ACTIVE' && (
              <button 
                style={{...styles.btn, opacity: processingId === contract.id ? 0.5 : 1}} 
                onClick={() => handleCancel(contract.id)}
                disabled={processingId === contract.id}
              >
                {processingId === contract.id ? "Processing..." : "Cancel Subscription"}
              </button>
            )}
          </div>
        ))}
    </div>
  );
}
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { getBillingInfo } from "../helpers/billing.server";
import { useEffect } from "react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const billing = await getBillingInfo(request);

  let shopName = "";
  try {
    const shopQuery = await admin.graphql(
      `#graphql
      query TawkShopName {
        shop {
          name
        }
      }`,
    );
    const shopJson = await shopQuery.json();
    shopName = shopJson.data?.shop?.name || "";
  } catch (error) {
    console.error("Failed to load shop name for chat:", error);
  }

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    billing,
    shop: session.shop || "",
    email: session.email || "",
    shopName,
  };
};

export default function App() {
  const { apiKey, billing, shop, email, shopName } = useLoaderData();

  useEffect(() => {
    if (billing?.billingRequired && billing?.billingUrl) {
      window.top.location.href = billing.billingUrl;
    }
  }, [billing]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__tawkLoaded) return;

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_API.visitor = {
      name: shopName || shop || "Shopify Merchant",
      email: email || undefined,
    };

    const scriptId = "tawk-to-script";
    if (document.getElementById(scriptId)) return;

    const s1 = document.createElement("script");
    s1.id = scriptId;
    s1.async = true;
    s1.src = "https://embed.tawk.to/69a2999c4e6f551c35b7292f/1jihig34o";
    s1.charset = "UTF-8";
    s1.setAttribute("crossorigin", "*");
    document.body.appendChild(s1);
    window.__tawkLoaded = true;
  }, [shop, email]);

  if (billing?.billingRequired) {
    return (
      <div style={{ padding: "24px", fontFamily: "sans-serif" }}>
        <h2>Billing Required</h2>
        <p>Your store does not have an active plan. Redirecting to billing...</p>
        {billing.billingUrl && (
          <p>
            <a href={billing.billingUrl} target="_top" rel="noreferrer">
              Open Billing
            </a>
          </p>
        )}
      </div>
    );
  }

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app/subscriptions">Subscription Manager</s-link>
        <s-link href="/app/contracts">Customer Contracts</s-link>
        <s-link href="/app/bundles">Fixed Bundles</s-link>
        <s-link href="/app/plan">Plan & Billing</s-link>
        <s-link href="/app/how-to-use">How to Use</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

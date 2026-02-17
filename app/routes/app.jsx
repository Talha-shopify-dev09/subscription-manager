import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { getBillingInfo } from "../helpers/billing.server";
import { useEffect } from "react";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  const billing = await getBillingInfo(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "", billing };
};

export default function App() {
  const { apiKey, billing } = useLoaderData();

  useEffect(() => {
    if (billing?.billingRequired && billing?.billingUrl) {
      window.top.location.href = billing.billingUrl;
    }
  }, [billing]);

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

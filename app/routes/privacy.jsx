import { Link } from "react-router";

export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: "800px", margin: "40px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
      <h1>Privacy Policy</h1>
      <p>
        This Privacy Policy explains how Socoba Bundles & Subscriptions collects, uses, and stores data when a
        merchant installs and uses the app.
      </p>

      <h2>Data We Collect</h2>
      <ul>
        <li>Shop information such as shop domain and app installation details.</li>
        <li>Subscription plans created in the app (plan settings and linked products or collections).</li>
        <li>Bundle definitions created in the app (bundle title, pricing, and linked products).</li>
        <li>Subscription contract data from Shopify (status, next billing date, and identifiers).</li>
        <li>Customer contact data for subscription management, such as email and customer ID.</li>
        <li>Transaction and bundle sale records for reporting in the app.</li>
      </ul>

      <h2>How We Use Data</h2>
      <ul>
        <li>To create and manage subscription plans and bundle offers in Shopify.</li>
        <li>To display subscription and bundle widgets on your storefront.</li>
        <li>To show contract status, billing dates, and analytics inside the app.</li>
        <li>To send subscription status emails to customers when triggered by Shopify webhooks.</li>
        <li>To provide customer access to their subscriptions through the portal page.</li>
      </ul>

      <h2>Data Storage</h2>
      <p>
        Data is stored in the app database using Prisma. Data is kept only for the purposes described above and is
        scoped to the shop that installed the app.
      </p>

      <h2>Data Sharing</h2>
      <p>
        The app uses Shopify APIs to read and write subscription, product, and order data. The app also uses Brevo
        to send transactional emails when subscription status changes.
      </p>

      <h2>Data Deletion</h2>
      <p>
        When the app is uninstalled, we delete shop data from our database. We also honor Shopify privacy webhooks
        for customer data requests and redaction.
      </p>

      <h2>Contact</h2>
      <p>
        If you have questions about this policy, contact us at socoba.apps@gmail.com.
      </p>

      <p>
        <Link to="/">Back to home</Link>
      </p>
    </div>
  );
}

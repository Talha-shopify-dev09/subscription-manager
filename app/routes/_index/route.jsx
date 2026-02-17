import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Socoba Bundles and Subscriptions</h1>
        <p className={styles.text}>
          Create subscription plans, manage contracts, and sell fixed bundles with
          automatic discounts.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Subscriptions</strong>. Create selling plans for products or
            collections with flexible intervals and discounts.
          </li>
          <li>
            <strong>Customer management</strong>. Pause or cancel contracts and
            monitor subscription performance.
          </li>
          <li>
            <strong>Bundles</strong>. Build fixed bundles and publish storefront
            widgets powered by app metafields.
          </li>
        </ul>
      </div>
    </div>
  );
}

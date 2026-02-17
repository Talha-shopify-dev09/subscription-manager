import { useLoaderData, useFetcher } from "react-router";
import {
  AppProvider,
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getBillingInfo } from "../helpers/billing.server";

export async function loader({ request }) {
  await authenticate.admin(request);
  const billing = await getBillingInfo(request);
  return Response.json({ billing, planBasic: "Basic", planPremium: "Premium" });
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const basicFeatureMode = formData.get("basicFeatureMode");

  if (!["BUNDLE", "SUBSCRIPTION"].includes(basicFeatureMode)) {
    return Response.json({ error: "Invalid selection" }, { status: 400 });
  }

  await db.shopSetting.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, basicFeatureMode },
    update: { basicFeatureMode },
  });

  return Response.json({ success: true, basicFeatureMode });
}

export default function PlanAndBilling() {
  const { billing, planBasic, planPremium } = useLoaderData();
  const fetcher = useFetcher();
  const isBasic = billing.activePlanName === planBasic;
  const isPremium = billing.activePlanName === planPremium;

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Plan & Billing">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Current Plan
                </Text>
                <Text as="p">
                  {billing.isDevStore
                    ? "Dev store (free access)"
                    : billing.activePlanName || "No active plan"}
                </Text>
                {!billing.isDevStore && !billing.activePlanName && (
                  <Banner tone="critical" title="No active subscription">
                    Your store does not have an active plan. Please select a plan in
                    the Shopify app billing screen to continue.
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Basic Plan Feature Choice
                </Text>
                <Text as="p">
                  Basic plan allows either Bundles or Subscriptions (one at a time).
                </Text>

                {!isBasic && !billing.isDevStore && (
                  <Banner tone="info" title="Not on Basic plan">
                    This setting only applies to Basic. Premium has full access.
                  </Banner>
                )}

                <InlineStack gap="200">
                  <fetcher.Form method="post">
                    <input type="hidden" name="basicFeatureMode" value="BUNDLE" />
                    <Button
                      submit
                      variant={billing.basicFeatureMode === "BUNDLE" ? "primary" : "secondary"}
                      loading={fetcher.state === "submitting" && fetcher.formData?.get("basicFeatureMode") === "BUNDLE"}
                      disabled={!isBasic && !billing.isDevStore}
                    >
                      Use Bundles
                    </Button>
                  </fetcher.Form>

                  <fetcher.Form method="post">
                    <input type="hidden" name="basicFeatureMode" value="SUBSCRIPTION" />
                    <Button
                      submit
                      variant={billing.basicFeatureMode === "SUBSCRIPTION" ? "primary" : "secondary"}
                      loading={fetcher.state === "submitting" && fetcher.formData?.get("basicFeatureMode") === "SUBSCRIPTION"}
                      disabled={!isBasic && !billing.isDevStore}
                    >
                      Use Subscriptions
                    </Button>
                  </fetcher.Form>
                </InlineStack>

                {billing.access === "BASIC_UNSET" && (
                  <Banner tone="warning" title="Action required">
                    Choose which feature you want to use on the Basic plan.
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}

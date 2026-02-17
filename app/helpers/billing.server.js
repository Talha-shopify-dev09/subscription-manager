import db from "../db.server";
import { authenticate } from "../shopify.server";

export const PLAN_BASIC = "Basic";
export const PLAN_PREMIUM = "Premium";
const DEFAULT_APP_HANDLE = "subscription-manager";

function getAppHandle() {
  return process.env.SHOPIFY_APP_HANDLE || DEFAULT_APP_HANDLE;
}

function getBillingUrl(shopDomain) {
  const appHandle = getAppHandle();
  return `https://${shopDomain}/admin/apps/${appHandle}/billing`;
}

async function fetchBillingData(admin) {
  const response = await admin.graphql(
    `#graphql
      query BillingInfo {
        shop {
          plan {
            displayName
            partnerDevelopment
          }
        }
        currentAppInstallation {
          activeSubscriptions {
            name
            status
            test
          }
        }
      }
    `,
  );

  const json = await response.json();
  const shopPlan = json.data?.shop?.plan || {};
  const isDevStore = shopPlan.partnerDevelopment === true;

  const activeSubscriptions =
    json.data?.currentAppInstallation?.activeSubscriptions || [];
  const active = activeSubscriptions.find((s) =>
    ["ACTIVE", "ACCEPTED"].includes(String(s.status).toUpperCase()),
  );
  const activePlanName = active?.name || null;

  return { isDevStore, activePlanName };
}

export async function getBillingInfoWithAdmin({ admin, shop }) {
  const { isDevStore, activePlanName } = await fetchBillingData(admin);

  let setting = await db.shopSetting.findUnique({
    where: { shop },
  });

  if (activePlanName && activePlanName !== setting?.planName) {
    setting = await db.shopSetting.upsert({
      where: { shop },
      create: { shop, planName: activePlanName },
      update: { planName: activePlanName },
    });
  }

  const effectivePlan = activePlanName || setting?.planName || null;
  const billingRequired = !isDevStore && !effectivePlan;

  let access = "NONE";
  if (isDevStore) {
    access = "BOTH";
  } else if (effectivePlan === PLAN_PREMIUM) {
    access = "BOTH";
  } else if (effectivePlan === PLAN_BASIC) {
    if (setting?.basicFeatureMode === "BUNDLE") access = "BUNDLE";
    if (setting?.basicFeatureMode === "SUBSCRIPTION") access = "SUBSCRIPTION";
    if (!setting?.basicFeatureMode) access = "BASIC_UNSET";
  }

  return {
    shop,
    isDevStore,
    activePlanName: effectivePlan,
    access,
    basicFeatureMode: setting?.basicFeatureMode || null,
    billingRequired,
    billingUrl: getBillingUrl(shop),
  };
}

export async function getBillingInfo(request) {
  const { admin, session } = await authenticate.admin(request);
  return getBillingInfoWithAdmin({ admin, shop: session.shop });
}

export function canUseFeature(billing, feature) {
  if (!billing) return false;
  if (billing.access === "BOTH") return true;
  if (feature === "BUNDLE" && billing.access === "BUNDLE") return true;
  if (feature === "SUBSCRIPTION" && billing.access === "SUBSCRIPTION") return true;
  return false;
}

import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April25, 
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  // CRITICAL: Registering webhooks to your /webhooks route
  webhooks: {
    SUBSCRIPTION_CONTRACTS_CREATE: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks",
    },
    SUBSCRIPTION_CONTRACTS_UPDATE: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks",
    },
    APP_UNINSTALLED: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks",
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
});

export default shopify;
export const apiVersion = ApiVersion.April25;
export const authenticate = shopify.authenticate;
export const registerWebhooks = shopify.registerWebhooks;
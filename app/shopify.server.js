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
    SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks",
    },
    SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks",
    },
    ORDERS_CREATE: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks",
    },
    APP_UNINSTALLED: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks",
    },
  },
  future: {
    v3_authenticatePublic: true,
    v3_lineItemBilling: true,
    expiringOfflineAccessTokens: true,
  },
});

export default shopify;
export const apiVersion = ApiVersion.April25;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

// FIX: This is the missing export causing the build error
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;

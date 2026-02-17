import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sendEmail } from "../email.server"; // Import the email sending utility

async function cleanupShopData(shop) {
  await db.session.deleteMany({ where: { shop } });
  await db.subscription.deleteMany({ where: { shop } });
  await db.bundle.deleteMany({ where: { shop } });
  await db.contract.deleteMany({ where: { shop } });
  await db.transaction.deleteMany({ where: { shop } });
  await db.bundleSale.deleteMany({ where: { shop } });
}

async function getShopName(admin) {
  if (!admin) return null;
  try {
    const response = await admin.graphql(
      `#graphql
      query {
        shop {
          name
        }
      }`
    );
    const json = await response.json();
    return json.data?.shop?.name || null;
  } catch (error) {
    return null;
  }
}

export const action = async ({ request }) => {
  console.log("Webhook action function hit!"); // Added for debugging
  // 1. Authenticate the webhook request
  // We include 'admin' here to allow GraphQL queries inside the webhook logic
  const { topic, shop, payload, session, admin } = await authenticate.webhook(request);

  console.log(`Received Webhook: ${topic} for shop ${shop}`);

  // Base URL for the customer account portal (dynamically constructed)
  const portalBaseUrl = `https://${shop}/apps/subscription-manager/portal`;
  const shopName = await getShopName(admin);
  const senderLabel = shopName ? `${shopName} via Socoba` : `Socoba for ${shop}`;

  switch (topic) {
    // --- 2. HANDLE NEW SUBSCRIPTION CONTRACTS ---
    case "SUBSCRIPTION_CONTRACTS_CREATE": {
      const { id, status, nextBillingDate, customer_id, currencyCode, lines } = payload;
      const contractId = String(id);

      const productGid = lines?.[0]?.productId;
      const recurringPrice = payload.lines?.[0]?.pricingPolicy?.price?.amount;

      // Construct customerGid for the GraphQL query
      const customerGid = customer_id ? `gid://shopify/Customer/${customer_id}` : null;
      let customerEmail = null;

      if (customerGid && admin) {
        try {
          const customerResponse = await admin.graphql(
            `#graphql
            query getCustomerEmail($id: ID!) {
              customer(id: $id) {
                email
              }
            }`,
            { variables: { id: customerGid } }
          );
          const customerData = await customerResponse.json();
          customerEmail = customerData.data?.customer?.email;
          console.log(`Fetched customer email for ${customerGid}: ${customerEmail}`);
        } catch (error) {
          console.error(`Error fetching customer email for ${customerGid}:`, error);
        }
      }
      try {
        let localPlan = await db.subscription.findFirst({
          where: { targetId: productGid, shop: shop }
        });

        if (!localPlan && admin && productGid) {
          console.log(`🔍 No direct product plan. Checking collections for: ${productGid}`);
          
          const response = await admin.graphql(
            `#graphql
            query getProductCollections($id: ID!) {
              product(id: $id) {
                collections(first: 10) {
                  nodes { id }
                }
              }
            }`, 
            { variables: { id: productGid } }
          );

          const collectionData = await response.json();
          const collectionIds = collectionData.data?.product?.collections?.nodes.map(c => c.id) || [];

          if (collectionIds.length > 0) {
            localPlan = await db.subscription.findFirst({
              where: { 
                shop: shop,
                targetId: { in: collectionIds },
                type: 'COLLECTION'
              }
            });
          }
        }

        await db.contract.upsert({
          where: { id: contractId },
          update: {
            status: status.toUpperCase(), 
            nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
            recurringPrice: recurringPrice,
          },
          create: {
            id: contractId,
            shop: shop,
            customerId: customerGid,
            customerName: `Customer ${customer_id}`,
            customerEmail: customerEmail,
            status: status.toUpperCase(),
            nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
            recurringPrice: recurringPrice,
            currencyCode: currencyCode || "USD",
            planId: localPlan?.id,
          },
        });

        console.log(`✅ Saved Contract ${contractId} (Linked Plan: ${localPlan ? localPlan.targetTitle : 'None'})`);
      } catch (error) {
        console.error("❌ Error saving contract:", error);
      }
      break;
    }

    // --- 3. HANDLE SUBSCRIPTION UPDATES ---
    case "SUBSCRIPTION_CONTRACTS_UPDATE": {
      const { id, status, nextBillingDate, customer } = payload; // Added customer to destructure
      const contractId = String(id);
      const recurringPrice = payload.lines?.[0]?.pricingPolicy?.price?.amount;
      try {
        const updatedContract = await db.contract.upsert({
          where: { id: contractId },
          update: {
            status: status.toUpperCase(),
            nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
            recurringPrice: recurringPrice,
          },
          create: {
            id: contractId,
            shop: shop,
            status: status.toUpperCase(),
            nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
            recurringPrice: recurringPrice,
            currencyCode: payload.currencyCode || "USD",
          },
          select: {
            customerEmail: true,
            customerName: true,
          }
        });
        console.log(`🔄 Updated Contract ${id} to ${status}`);

        const customerEmail = updatedContract.customerEmail;
        const customerFirstName = updatedContract.customerName?.split(' ')[0];

        console.log(`Debug: Attempting to send email for contract ${contractId}. Customer Email: ${customerEmail}, First Name: ${customerFirstName}`);

        if (customerEmail) {
          if (status.toUpperCase() === 'PAUSED') {
            await sendEmail({
                to: customerEmail,
                senderName: senderLabel,
                subject: `[${shop}] Your Subscription Has Been Paused`,
                text: `Hi ${customerFirstName || 'there'},\n\nYour subscription for contract ${contractId} has been successfully paused. You can resume it anytime from your portal.\n\nManage your subscriptions here: ${portalBaseUrl}`,
                html: `<p>Hi ${customerFirstName || 'there'},</p><p>Your subscription for contract <b>${contractId}</b> has been successfully paused. You can resume it anytime from your portal.</p><p>Manage your subscriptions here: <a href="${portalBaseUrl}">${portalBaseUrl}</a></p>`
            });
          } else if (status.toUpperCase() === 'CANCELLED') {
            await sendEmail({
                to: customerEmail,
                senderName: senderLabel,
                subject: `[${shop}] Your Subscription Has Been Cancelled`,
                text: `Hi ${customerFirstName || 'there'},\n\nYour subscription for contract ${contractId} has been successfully cancelled. We're sorry to see you go!\n\nManage your subscriptions here: ${portalBaseUrl}`,
                html: `<p>Hi ${customerFirstName || 'there'},</p><p>Your subscription for contract <b>${contractId}</b> has been successfully cancelled. We're sorry to see you go!</p><p>Manage your subscriptions here: <a href="${portalBaseUrl}">${portalBaseUrl}</a></p>`
            });
          }
        }
      } catch (error) {
        console.error("❌ Error updating contract:", error);
      }
      break;
    }

    // --- 4. HANDLE SUCCESSFUL BILLING ATTEMPTS ---
    case "SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS": {
      const { subscriptionContractId, completedOrder, customer } = payload; // Destructure customer from payload
      if (!subscriptionContractId || !completedOrder) {
        console.warn("Received SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS with missing data.");
        break;
      }
      
      const amount = completedOrder.totalPriceSet.shopMoney.amount;
      const currency = completedOrder.totalPriceSet.shopMoney.currencyCode;
      const customerEmail = customer?.email;
      const customerFirstName = customer?.firstName;

      try {
        await db.contract.upsert({
          where: { id: String(subscriptionContractId) },
          update: {},
          create: {
            id: String(subscriptionContractId),
            shop: shop,
            status: "ACTIVE",
            currencyCode: currency || "USD",
          },
        });

        await db.transaction.create({
          data: {
            shop: shop,
            contractId: String(subscriptionContractId),
            amount: parseFloat(amount),
            currencyCode: currency
          }
        });
        console.log(`💰 Recorded transaction of ${amount} ${currency} for contract ${subscriptionContractId}`);

        if (customerEmail) {
            await sendEmail({
                to: customerEmail,
                senderName: senderLabel,
                subject: `[${shop}] Your Subscription Payment Was Successful!`,
                text: `Hi ${customerFirstName || 'there'},\n\nYour recent subscription payment of ${amount} ${currency} for order ${completedOrder.name} was successful. Thank you for your continued subscription!\n\nYou can manage your subscriptions here: ${portalBaseUrl}`,
                html: `<p>Hi ${customerFirstName || 'there'},</p><p>Your recent subscription payment of <b>${amount} ${currency}</b> for order ${completedOrder.name} was successful. Thank you for your continued subscription!</p><p>You can manage your subscriptions here: <a href="${portalBaseUrl}">${portalBaseUrl}</a></p>`
            });
        }

      } catch (error) {
        console.error("❌ Error recording transaction:", error);

        if (error.code === 'P2003') { // Foreign key constraint failed
          console.error(`  Contract with ID ${subscriptionContractId} not found in the database. A contract must exist before a transaction can be recorded.`);
        }
      }
      break;
    }

    // --- 4.1. HANDLE FAILED BILLING ATTEMPTS ---
    case "SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE": {
      const { subscriptionContractId, customer, errorMessage } = payload; // Assuming errorMessage might be in payload
      
      const customerEmail = customer?.email;
      const customerFirstName = customer?.firstName;
      const failureReason = errorMessage || "payment failed"; // Default message if no specific error

      try {
        await db.contract.upsert({
          where: { id: String(subscriptionContractId) },
          update: {
            status: 'FAILED',
          },
          create: {
            id: String(subscriptionContractId),
            shop: shop,
            status: 'FAILED',
            currencyCode: payload.currencyCode || "USD",
          },
        });
        console.log(`❌ Updated Contract ${subscriptionContractId} status to FAILED due to billing attempt failure.`);

        if (customerEmail) {
            await sendEmail({
                to: customerEmail,
                senderName: senderLabel,
                subject: `[${shop}] Important: Your Subscription Payment Failed`,
                text: `Hi ${customerFirstName || 'there'},\n\nYour recent subscription payment for contract ${subscriptionContractId} failed due to: ${failureReason}. Please update your payment method to avoid interruption of service.\n\nYou can update your payment method here: ${portalBaseUrl}`,
                html: `<p>Hi ${customerFirstName || 'there'},</p><p>Your recent subscription payment for contract <b>${subscriptionContractId}</b> failed due to: <b>${failureReason}</b>. Please update your payment method to avoid interruption of service.</p><p>You can update your payment method here: <a href="${portalBaseUrl}">Update Payment Method</a></p>`
            });
        }

      } catch (error) {
        console.error("❌ Error handling FAILED billing attempt:", error);

        if (error.code === 'P2025') { // Record to update not found
          console.error(`  Contract with ID ${subscriptionContractId} not found in the database. Cannot update status.`);
        }
      }
      break;
    }


    // --- 5. HANDLE NEW ORDERS (for bundle tracking) ---
    case "ORDERS_CREATE": {
      const { id: orderId, customer: customerData, total_price, currency, discount_applications } = payload;
      
      console.log("ORDERS_CREATE Webhook Payload (discount_applications):", JSON.stringify(discount_applications, null, 2));

      try {
        const bundles = await db.bundle.findMany({
          where: { shop: shop, discountId: { not: null } },
          select: { id: true, title: true, discountId: true, price: true }
        });
        console.log("Bundles from DB:", JSON.stringify(bundles, null, 2));

        const appliedBundleDiscount = discount_applications.find(
          (da) => da.type === "automatic" && bundles.some(b => da.title && da.title.includes(b.title))
        );

        if (appliedBundleDiscount) {
          const matchedBundle = bundles.find(b => appliedBundleDiscount.title.includes(b.title));
          if (matchedBundle) {
            await db.bundleSale.create({
              data: {
                shop: shop,
                orderId: String(orderId),
                bundleId: matchedBundle.id,
                bundleTitle: matchedBundle.title,
                totalAmount: parseFloat(total_price),
                currencyCode: currency,
                customerId: String(customerData?.id) || null,
              }
            });
            console.log(`🎁 Recorded bundle sale for Order ${orderId} (Bundle: ${matchedBundle.title})`);
          } else {
            console.log(`❌ No matching bundle found for applied automatic discount: ${appliedBundleDiscount.shopify_discount_id}`);
          }
        } else {
          console.log("❌ No relevant automatic bundle discount found in order.");
        }
      } catch (error) {
        console.error("❌ Error recording bundle sale:", error);
      }
      break;
    }

    // --- 6. GDPR / COMPLIANCE WEBHOOKS ---
    case "CUSTOMERS_DATA_REQUEST": {
      console.log(`GDPR data request received for shop: ${shop}`);
      break;
    }

    case "CUSTOMERS_REDACT": {
      try {
        const customerId = payload?.customer?.id;
        const customerGid = customerId ? `gid://shopify/Customer/${customerId}` : null;
        const customerEmail = payload?.customer?.email || null;

        if (customerGid) {
          const contracts = await db.contract.findMany({
            where: { customerId: customerGid, shop },
            select: { id: true },
          });
          const contractIds = contracts.map((c) => c.id);
          if (contractIds.length > 0) {
            await db.transaction.deleteMany({ where: { contractId: { in: contractIds }, shop } });
            await db.contract.deleteMany({ where: { id: { in: contractIds }, shop } });
          }
          await db.bundleSale.deleteMany({ where: { customerId: String(customerId), shop } });
        }

        if (customerEmail) {
          const emailContracts = await db.contract.findMany({
            where: { customerEmail, shop },
            select: { id: true },
          });
          const emailContractIds = emailContracts.map((c) => c.id);
          if (emailContractIds.length > 0) {
            await db.transaction.deleteMany({ where: { contractId: { in: emailContractIds }, shop } });
            await db.contract.deleteMany({ where: { id: { in: emailContractIds }, shop } });
          }
        }

        console.log(`GDPR customer redact completed for shop: ${shop}`);
      } catch (error) {
        console.error("GDPR customer redact failed:", error);
      }
      break;
    }

    case "SHOP_REDACT": {
      try {
        await cleanupShopData(shop);
        console.log(`GDPR shop redact completed for shop: ${shop}`);
      } catch (error) {
        console.error("GDPR shop redact failed:", error);
      }
      break;
    }

    // --- 6. APP UNINSTALL CLEANUP ---
    case "APP_UNINSTALLED": {
      if (session) {
        // Clean up all shop data to comply with Shopify requirements
        await cleanupShopData(shop);
        console.log(`🗑️ Cleaned up data for uninstalled shop: ${shop}`);
      }
      break;
    }

    default:
      console.warn(`Unhandled webhook topic: ${topic}`);
      break;
  }

  // Always return a 200 OK Response to satisfy Shopify's delivery check
  return new Response();
};

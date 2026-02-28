import { useState, useCallback, useEffect } from "react";
import { useFetcher, useLoaderData, useRevalidator, Link } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getBillingInfo, canUseFeature } from "../helpers/billing.server";
import {
  AppProvider, Page, Layout, Card, Button, Text, TextField, Select,
  BlockStack, InlineStack, Badge, IndexTable, Modal, FormLayout,
  EmptyState, Divider, Box, Thumbnail, Spinner
} from "@shopify/polaris";
import { DeleteIcon, PlusIcon } from "@shopify/polaris-icons";
import enTranslations from "@shopify/polaris/locales/en.json";
import { TitleBar } from "@shopify/app-bridge-react";
import db from "../db.server"; 

// --- LOADER ---
export async function loader({ request }) {
  const billing = await getBillingInfo(request);
  if (!canUseFeature(billing, "SUBSCRIPTION")) {
    return Response.json({ gated: true, billing, subscriptions: [], products: [] });
  }

  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query SubscriptionsProducts {
        products(first: 50) { edges { node { id title priceRangeV2 { minVariantPrice { amount } } } } }
      }
    `
  );
  
  const responseJson = await response.json();
  
  const products = responseJson.data.products.edges.map(e => ({
    id: e.node.id, title: e.node.title, price: e.node.priceRangeV2.minVariantPrice.amount
  }));
  
  const subscriptions = await db.subscription.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });
  
  return Response.json({ subscriptions, products, billing, gated: false });
}

// --- ACTION ---
export async function action({ request }) {
  const billing = await getBillingInfo(request);
  if (!canUseFeature(billing, "SUBSCRIPTION")) {
    return Response.json({ error: "Your plan does not allow Subscriptions." }, { status: 403 });
  }

  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");
  
  if (actionType === "delete") {
    const id = formData.get("id");
    const shopifyGroupId = formData.get("shopifyGroupId");
    if (shopifyGroupId) {
      try {
        await admin.graphql(
          `#graphql
          mutation sellingPlanGroupDelete($id: ID!) {
            sellingPlanGroupDelete(id: $id) { deletedSellingPlanGroupId }
          }`,
          { variables: { id: shopifyGroupId } }
        );
      } catch(e) { console.error("Delete Error", e); }
    }
    await db.subscription.delete({ where: { id } });
    return Response.json({ success: true });
  }

  if (actionType === "create") {
    const targetTitle = formData.get("targetTitle");
    const originalPrice = formData.get("originalPrice");
    const plans = JSON.parse(formData.get("plans") || "[]");
    const targetIds = JSON.parse(formData.get("targetIds") || "[]");

    if (targetIds.length === 0) return Response.json({ error: "No products selected" }, { status: 400 });

    const sellingPlansToCreate = plans.map((plan, index) => {
      const billingPolicy = { recurring: { interval: plan.interval, intervalCount: parseInt(plan.intervalCount) } };
      if (plan.maxCycles && parseInt(plan.maxCycles) > 0) billingPolicy.recurring.maxCycles = parseInt(plan.maxCycles);

      return {
        name: `Deliver every ${plan.intervalCount} ${plan.interval.toLowerCase()}(s)`,
        options: [`Every ${plan.intervalCount} ${plan.interval.toLowerCase()}(s)`],
        position: index + 1,
        category: "SUBSCRIPTION", 
        billingPolicy,
        deliveryPolicy: { recurring: { interval: plan.interval, intervalCount: parseInt(plan.intervalCount) } },
        pricingPolicies: [{ fixed: { adjustmentType: "PERCENTAGE", adjustmentValue: { percentage: parseFloat(plan.discount) } } }]
      };
    });

    try {
      const response = await admin.graphql(
        `#graphql
        mutation sellingPlanGroupCreate($input: SellingPlanGroupInput!) {
          sellingPlanGroupCreate(input: $input) {
            sellingPlanGroup { 
              id 
              sellingPlans(first: 10) { 
                edges { node { id billingPolicy { ... on SellingPlanRecurringBillingPolicy { interval intervalCount } } } } 
              } 
            }
            userErrors { field message }
          }
        }`,
        { variables: { input: { name: `Subscription: ${targetTitle}`, merchantCode: `sub-${Date.now()}`, options: ["Delivery Interval"], position: 1, sellingPlansToCreate } } }
      );

      const responseJson = await response.json();
      if (responseJson.data?.sellingPlanGroupCreate?.userErrors?.length > 0) return Response.json({ error: responseJson.data.sellingPlanGroupCreate.userErrors[0].message }, { status: 400 });

      const newGroup = responseJson.data.sellingPlanGroupCreate.sellingPlanGroup;
      const batchSize = 50; 
      let productsAttached = 0;
      const attachErrors = [];
      
      for (let i = 0; i < targetIds.length; i += batchSize) {
        const batch = targetIds.slice(i, i + batchSize);
        const attachResponse = await admin.graphql(
          `#graphql
          mutation sellingPlanGroupAddProducts($id: ID!, $productIds: [ID!]!) {
            sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {
              userErrors { message }
            }
          }`,
          { variables: { id: newGroup.id, productIds: batch } }
        );
        const attachJson = await attachResponse.json();
        if (attachJson.errors?.length) {
          attachErrors.push(...attachJson.errors.map((e) => e.message || "Unknown attach error"));
          continue;
        }
        const userErrors = attachJson.data?.sellingPlanGroupAddProducts?.userErrors || [];
        if (userErrors.length > 0) {
          attachErrors.push(...userErrors.map((e) => e.message || "Unknown attach error"));
          continue;
        }
        productsAttached += batch.length;
      }

      const shopifyPlanIdsMap = {};
      newGroup.sellingPlans.edges.forEach(({ node }) => {
          const key = `${node.billingPolicy.interval}_${node.billingPolicy.intervalCount}`;
          shopifyPlanIdsMap[key] = node.id;
      });

      await db.subscription.create({
        data: {
          shop: session.shop,
          type: 'PRODUCT',
          targetId: targetIds[0],
          targetTitle, 
          originalPrice: originalPrice || "0",
          plansData: plans,
          shopifyGroupId: newGroup.id,
          shopifyPlanIds: shopifyPlanIdsMap,
          enabled: true
        }
      });

      const warning = attachErrors.length > 0
        ? `Attached ${productsAttached}/${targetIds.length} products. Some products failed to attach.`
        : null;

      return Response.json({ success: true, productsAttached, warning });
    } catch (error) {
      return Response.json({ error: "System Error: " + error.message }, { status: 500 });
    }
  }
  return Response.json({ success: true });
}

export function ErrorBoundary() {
  return (
    <AppProvider i18n={enTranslations}>
      <Page>
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="There was an error loading your subscriptions."
                action={{ content: 'Back', onAction: () => window.history.back() }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Please try again later.</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}


import { useNavigation } from "react-router";

export default function Subscriptions() {
  const { subscriptions, products, billing, gated } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const revalidator = useRevalidator();

  const sortedSubscriptions = [...subscriptions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  const [showModal, setShowModal] = useState(false);
  const [plans, setPlans] = useState([{ interval: "MONTH", intervalCount: 1, discount: 10, maxCycles: "" }]);
  
  const [selectedTitle, setSelectedTitle] = useState("");
  const [selectedPrice, setSelectedPrice] = useState("");
  const [targetIds, setTargetIds] = useState([]);
  const [previewProducts, setPreviewProducts] = useState([]);

  const isLoading = ["loading", "submitting"].includes(fetcher.state);

  const addPlan = () => setPlans([...plans, { interval: "MONTH", intervalCount: 1, discount: 0, maxCycles: "" }]);
  const removePlan = (index) => { const n = [...plans]; n.splice(index, 1); setPlans(n); };
  const updatePlan = (index, field, value) => { const n = [...plans]; n[index][field] = value; setPlans(n); };

  const handleCancel = useCallback(() => {
    setShowModal(false);
    setPlans([{ interval: "MONTH", intervalCount: 1, discount: 10, maxCycles: "" }]);
    setTargetIds([]); setPreviewProducts([]); setSelectedTitle(""); setSelectedPrice("");
  }, []);

  const handleProductSelect = useCallback((value) => {
    const product = products.find(p => p.id === value);
    if (product) {
        setTargetIds([product.id]); 
        setSelectedTitle(product.title);
        setSelectedPrice(product.price);
        setPreviewProducts([{ id: product.id, title: product.title }]);
    }
  }, [products]);

  const handleSave = useCallback(() => {
    if (targetIds.length === 0) return shopify.toast.show("No products selected", { isError: true });
    const data = new FormData();
    data.append("action", "create");
    data.append("targetTitle", selectedTitle);
    data.append("originalPrice", selectedPrice);
    data.append("targetIds", JSON.stringify(targetIds)); 
    data.append("plans", JSON.stringify(plans));
    fetcher.submit(data, { method: "post" });
  }, [targetIds, selectedTitle, selectedPrice, plans, fetcher, shopify]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      shopify.toast.show(`Success! Applied to ${fetcher.data.productsAttached} products.`);
      if (fetcher.data.warning) {
        shopify.toast.show(fetcher.data.warning, { isError: true });
      }
      handleCancel();
      revalidator.revalidate();
    }
    if (fetcher.state === "idle" && fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.state, fetcher.data, handleCancel, shopify]);

  const { state } = useNavigation();

  if (state === "loading") {
    return (
      <AppProvider i18n={enTranslations}>
        <Page>
          <Layout>
            <Layout.Section>
              <Card>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100px' }}>
                  <Spinner accessibilityLabel="Loading subscriptions" size="large" />
                </div>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      </AppProvider>
    );
  }

  if (gated) {
    return (
      <AppProvider i18n={enTranslations}>
        <Page title="Subscriptions">
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Subscriptions Locked</Text>
                  <Text as="p">
                    Your current plan does not allow Subscriptions. If you are on the Basic plan,
                    choose Subscriptions in Plan & Billing. For full access, upgrade to Premium.
                  </Text>
                  <Link to="/app/plan">
                    <Button variant="primary">Go to Plan & Billing</Button>
                  </Link>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      </AppProvider>
    );
  }

  return (
    <AppProvider i18n={enTranslations}>
      <Page>
        <TitleBar title="Socoba Subscriptions">
          <button variant="primary" onClick={() => setShowModal(true)}>Create Plan</button>
        </TitleBar>
        <Layout>
          <Layout.Section>
            <Card padding="0">
              {subscriptions.length === 0 ? (
                <EmptyState heading="No subscriptions" action={{ content: 'Create Subscription', onAction: () => setShowModal(true) }} image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png" />
              ) : (
                <IndexTable resourceName={{ singular: 'sub', plural: 'subs' }} itemCount={sortedSubscriptions.length} headings={[{ title: 'Target' }, { title: 'Plans' }, { title: 'Action' }]}>
                  {sortedSubscriptions.map((sub, index) => (
                    <IndexTable.Row id={sub.id} key={sub.id} position={index}>
                      <IndexTable.Cell><Text fontWeight="bold">{sub.targetTitle}</Text></IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="100" wrap>
                          {sub.plansData.map((p, i) => <Badge key={i} tone="info">Every {p.intervalCount} {p.interval.toLowerCase()}</Badge>)}
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Button size="slim" tone="critical" onClick={() => { if(confirm("Delete?")) { const d = new FormData(); d.append("action", "delete"); d.append("id", sub.id); d.append("shopifyGroupId", sub.shopifyGroupId); fetcher.submit(d, { method: "post" }); }}}>Delete</Button>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>
        </Layout>
        <Modal open={showModal} onClose={handleCancel} title="Create Subscription Plan" primaryAction={{ content: 'Save', onAction: handleSave, loading: isLoading }}>
          <Modal.Section>
            <FormLayout>
              <Select label="Select Product" options={[{ label: 'Select product', value: '' }, ...products.map(p => ({ label: p.title, value: p.id }))]} onChange={handleProductSelect} />
              {previewProducts.length > 0 && (
                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <Text variant="bodyMd" fontWeight="bold">Applying to {previewProducts.length} products:</Text>
                  <div style={{maxHeight: '150px', overflowY: 'auto', marginTop: '10px'}}>
                    <BlockStack gap="200">
                      {previewProducts.slice(0, 50).map(p => (
                        <InlineStack key={p.id} align="start" gap="200">
                          {p.image && <Thumbnail source={p.image} size="small" alt={p.title}/>}
                          <Text variant="bodySm">{p.title}</Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </div>
                </Box>
              )}
              <Divider />
              <InlineStack align="space-between"><Text variant="headingSm">Intervals</Text><Button icon={PlusIcon} onClick={addPlan}>Add</Button></InlineStack>
              <BlockStack gap="400">
                {plans.map((plan, index) => (
                  <Box key={index} background="bg-surface-secondary" padding="400" borderRadius="200">
                    <BlockStack gap="300">
                      <InlineStack align="space-between"><Text fontWeight="bold">Plan #{index+1}</Text><Button icon={DeleteIcon} tone="critical" variant="plain" onClick={() => removePlan(index)} /></InlineStack>
                      <InlineStack gap="200">
                        <div style={{flex:1}}><TextField label="Every" type="number" value={plan.intervalCount} onChange={(v)=>updatePlan(index, 'intervalCount', v)} autoComplete="off"/></div>
                        <div style={{flex:1.5}}><Select label="Unit" options={[{ label: "Day(s)", value: "DAY" }, { label: "Week(s)", value: "WEEK" }, { label: "Month(s)", value: "MONTH" }, { label: "Year(s)", value: "YEAR" }]} value={plan.interval} onChange={(v)=>updatePlan(index, 'interval', v)} /></div>
                        <div style={{flex:1}}><TextField label="Discount %" type="number" value={plan.discount} onChange={(v)=>updatePlan(index, 'discount', v)} suffix="%" autoComplete="off"/></div>
                      </InlineStack>
                      <TextField label="Max Charges (Optional)" type="number" value={plan.maxCycles} onChange={(v) => updatePlan(index, 'maxCycles', v)} placeholder="∞" autoComplete="off" />
                    </BlockStack>
                  </Box>
                ))}
              </BlockStack>
            </FormLayout>
          </Modal.Section>
        </Modal>
      </Page>
    </AppProvider>
  );
}

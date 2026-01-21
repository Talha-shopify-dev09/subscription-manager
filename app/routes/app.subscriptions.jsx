import { useState, useCallback, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  AppProvider, Page, Layout, Card, Button, Text, TextField, Select,
  BlockStack, InlineStack, Banner, Badge, IndexTable, Modal, FormLayout,
  EmptyState, Divider, Box
} from "@shopify/polaris";
import { DeleteIcon, PlusIcon } from "@shopify/polaris-icons";
import enTranslations from "@shopify/polaris/locales/en.json";
import { TitleBar } from "@shopify/app-bridge-react";
import db from "../db.server"; 

// --- LOADER ---
export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query {
        products(first: 20) {
          edges {
            node {
              id
              title
              priceRangeV2 { minVariantPrice { amount } }
            }
          }
        }
        collections(first: 20) {
          edges {
            node {
              id
              title
              productsCount { count }
            }
          }
        }
      }
    `
  );
  
  const responseJson = await response.json();
  
  const products = responseJson.data.products.edges.map(edge => ({
    id: edge.node.id,
    title: edge.node.title,
    price: edge.node.priceRangeV2.minVariantPrice.amount
  }));
  
  const collections = responseJson.data.collections.edges.map(edge => ({
    id: edge.node.id,
    title: edge.node.title,
    productsCount: edge.node.productsCount.count
  }));
  
  const subscriptions = await db.subscription.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });
  
  return { subscriptions, products, collections };
}

// --- ACTION ---
export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");
  
  // 1. DELETE
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
      } catch (err) { console.error(err); }
    }
    await db.subscription.delete({ where: { id } });
    return Response.json({ success: true });
  }

  // 2. CREATE
  if (actionType === "create") {
    const type = formData.get("type");
    const targetId = formData.get("targetId");
    const targetTitle = formData.get("targetTitle");
    const originalPrice = formData.get("originalPrice");
    const plans = JSON.parse(formData.get("plans") || "[]");

    const sellingPlansToCreate = plans.map((plan, index) => {
      const billingPolicy = {
        recurring: { 
          interval: plan.interval, 
          intervalCount: parseInt(plan.intervalCount) 
        }
      };

      if (plan.maxCycles && parseInt(plan.maxCycles) > 0) {
        billingPolicy.recurring.maxCycles = parseInt(plan.maxCycles);
      }

      let planName = `Deliver every ${plan.intervalCount} ${plan.interval.toLowerCase()}(s)`;
      if(plan.maxCycles) planName += ` (Max ${plan.maxCycles})`;
      planName += ` - Save ${plan.discount}%`;

      return {
        name: planName,
        options: [`Every ${plan.intervalCount} ${plan.interval.toLowerCase()}(s)`],
        position: index + 1,
        category: "SUBSCRIPTION", 
        billingPolicy: billingPolicy,
        deliveryPolicy: {
          recurring: { interval: plan.interval, intervalCount: parseInt(plan.intervalCount) }
        },
        pricingPolicies: [
          {
            fixed: {
              adjustmentType: "PERCENTAGE",
              adjustmentValue: { percentage: parseFloat(plan.discount) }
            }
          }
        ]
      };
    });

    // Create Group
    const response = await admin.graphql(
      `#graphql
      mutation sellingPlanGroupCreate($input: SellingPlanGroupInput!) {
        sellingPlanGroupCreate(input: $input) {
          sellingPlanGroup {
            id
            sellingPlans(first: 10) {
              edges {
                node {
                  id
                  billingPolicy { ... on SellingPlanRecurringBillingPolicy { interval intervalCount } }
                }
              }
            }
          }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            name: `Subscription: ${targetTitle}`,
            merchantCode: `sub-${targetId}-${Date.now()}`,
            options: ["Delivery Interval"],
            position: 1,
            sellingPlansToCreate: sellingPlansToCreate
          }
        }
      }
    );

    const responseJson = await response.json();
    if (responseJson.data.sellingPlanGroupCreate.userErrors.length > 0) {
      return Response.json({ error: responseJson.data.sellingPlanGroupCreate.userErrors }, { status: 400 });
    }

    const newGroup = responseJson.data.sellingPlanGroupCreate.sellingPlanGroup;

    // --- ATTACH LOGIC ---
    if (type === "product") {
      await admin.graphql(
        `#graphql
        mutation productJoinSellingPlanGroups($id: ID!, $sellingPlanGroupIds: [ID!]!) {
          productJoinSellingPlanGroups(id: $id, sellingPlanGroupIds: $sellingPlanGroupIds) { product { id } }
        }`,
        { variables: { id: targetId, sellingPlanGroupIds: [newGroup.id] } }
      );
    } else if (type === "collection") {
      
      // FIX: Loop to get ALL products in collection (Pagination)
      let allProductIds = [];
      let hasNextPage = true;
      let endCursor = null;

      while (hasNextPage) {
        const query = `#graphql
          query getCollectionProducts($id: ID!, $cursor: String) {
            collection(id: $id) {
              products(first: 250, after: $cursor) {
                pageInfo { hasNextPage endCursor }
                edges { node { id } }
              }
            }
          }`;

        const cResponse = await admin.graphql(query, { variables: { id: targetId, cursor: endCursor } });
        const cData = await cResponse.json();
        
        const edges = cData.data.collection?.products?.edges || [];
        allProductIds.push(...edges.map(e => e.node.id));

        hasNextPage = cData.data.collection?.products?.pageInfo?.hasNextPage;
        endCursor = cData.data.collection?.products?.pageInfo?.endCursor;
      }

      // Attach in batches if needed (Shopify limits array size, usually 250 is safe)
      if(allProductIds.length > 0) {
        await admin.graphql(
          `#graphql
          mutation sellingPlanGroupAddProducts($id: ID!, $productIds: [ID!]!) {
            sellingPlanGroupAddProducts(id: $id, productIds: $productIds) { sellingPlanGroup { id } }
          }`,
          { variables: { id: newGroup.id, productIds: allProductIds } }
        );
      }
    }

    // Map IDs
    const shopifyPlanIdsMap = {};
    newGroup.sellingPlans.edges.forEach(({ node }) => {
       const interval = node.billingPolicy.interval;
       const count = node.billingPolicy.intervalCount;
       plans.forEach((p, index) => {
          if (p.interval === interval && parseInt(p.intervalCount) === count) {
             shopifyPlanIdsMap[index + 1] = node.id;
          }
       });
    });

    // Save to DB
    await db.subscription.create({
      data: {
        shop: session.shop,
        type, 
        targetId, 
        targetTitle, 
        originalPrice: originalPrice || "0",
        plansData: JSON.stringify(plans),
        shopifyGroupId: newGroup.id,
        shopifyPlanIds: JSON.stringify(shopifyPlanIdsMap),
        enabled: true
      }
    });
  }
  return Response.json({ success: true });
}

// --- REACT COMPONENT ---
export default function Subscriptions() {
  const { subscriptions, products, collections } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  
  const [showModal, setShowModal] = useState(false);
  const [subscriptionType, setSubscriptionType] = useState("product");
  const [plans, setPlans] = useState([{ interval: "MONTH", intervalCount: 1, discount: 10, maxCycles: "" }]);
  const [formData, setFormData] = useState({ targetId: "", targetTitle: "", originalPrice: "" });

  const isLoading = ["loading", "submitting"].includes(fetcher.state);

  const addPlan = () => setPlans([...plans, { interval: "MONTH", intervalCount: 1, discount: 0, maxCycles: "" }]);
  const removePlan = (index) => {
    const newPlans = [...plans];
    newPlans.splice(index, 1);
    setPlans(newPlans);
  };
  const updatePlan = (index, field, value) => {
    const newPlans = [...plans];
    newPlans[index][field] = value;
    setPlans(newPlans);
  };

  const handleCancel = useCallback(() => {
    setShowModal(false);
    setSubscriptionType("product");
    setPlans([{ interval: "MONTH", intervalCount: 1, discount: 10, maxCycles: "" }]);
    setFormData({ targetId: "", targetTitle: "", originalPrice: "" });
  }, []);

  const handleProductSelect = useCallback((value) => {
    const product = products.find(p => p.id === value);
    if (product) setFormData(prev => ({ ...prev, targetId: product.id, targetTitle: product.title, originalPrice: product.price }));
  }, [products]);

  const handleCollectionSelect = useCallback((value) => {
    const collection = collections.find(c => c.id === value);
    if (collection) setFormData(prev => ({ ...prev, targetId: collection.id, targetTitle: collection.title, originalPrice: "N/A" }));
  }, [collections]);

  const handleSave = useCallback(() => {
    if (!formData.targetId) return shopify.toast.show("Please select a target", { isError: true });
    const data = new FormData();
    data.append("action", "create");
    data.append("type", subscriptionType);
    data.append("targetId", formData.targetId);
    data.append("targetTitle", formData.targetTitle);
    data.append("originalPrice", formData.originalPrice);
    data.append("plans", JSON.stringify(plans));
    fetcher.submit(data, { method: "post" });
  }, [formData, subscriptionType, plans, fetcher, shopify]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      shopify.toast.show("Subscription created!");
      handleCancel();
    }
  }, [fetcher.state, fetcher.data, handleCancel, shopify]);

  const productOptions = [{ label: 'Select product', value: '' }, ...products.map(p => ({ label: `${p.title}`, value: p.id }))];
  const collectionOptions = [{ label: 'Select collection', value: '' }, ...collections.map(c => ({ label: c.title, value: c.id }))];
  const intervalOptions = [{ label: "Day(s)", value: "DAY" }, { label: "Week(s)", value: "WEEK" }, { label: "Month(s)", value: "MONTH" }, { label: "Year(s)", value: "ANNUAL" }];

  return (
    <AppProvider i18n={enTranslations}>
      <Page>
        <TitleBar title="Subscription Manager">
          <button variant="primary" onClick={() => setShowModal(true)}>Create Subscription</button>
        </TitleBar>
        <Layout>
          <Layout.Section>
            <Card padding="0">
              {subscriptions.length === 0 ? (
                <EmptyState heading="No subscriptions" action={{ content: 'Create Subscription', onAction: () => setShowModal(true) }} image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png">
                  <p>Create your first plan.</p>
                </EmptyState>
              ) : (
                <IndexTable resourceName={{ singular: 'sub', plural: 'subs' }} itemCount={subscriptions.length} headings={[{ title: 'Target' }, { title: 'Plans' }, { title: 'Action' }]}>
                  {subscriptions.map((sub, index) => {
                    let plansDisplay = [];
                    try { plansDisplay = JSON.parse(sub.plansData || '[]'); } catch(e){}
                    return (
                      <IndexTable.Row id={sub.id} key={sub.id} position={index}>
                        <IndexTable.Cell><Text fontWeight="bold">{sub.targetTitle}</Text></IndexTable.Cell>
                        <IndexTable.Cell>
                          <InlineStack gap="100" wrap>
                            {plansDisplay.map((p, i) => (
                              <Badge key={i} tone="info">
                                Every {p.intervalCount} {p.interval.toLowerCase()} 
                              </Badge>
                            ))}
                          </InlineStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Button size="slim" tone="critical" onClick={() => {
                             if(confirm("Delete?")) {
                               const d = new FormData(); d.append("action", "delete"); d.append("id", sub.id); d.append("shopifyGroupId", sub.shopifyGroupId);
                               fetcher.submit(d, { method: "post" });
                             }
                          }}>Delete</Button>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    );
                  })}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>
        </Layout>

        <Modal open={showModal} onClose={handleCancel} title="Create Subscription Plan" primaryAction={{ content: 'Save', onAction: handleSave, loading: isLoading }}>
          <Modal.Section>
            <FormLayout>
              <Select label="Type" options={[{ label: 'Product', value: 'product' }, { label: 'Collection', value: 'collection' }]} value={subscriptionType} onChange={setSubscriptionType} />
              {subscriptionType === 'product' ? (
                <Select label="Select Product" options={productOptions} value={formData.targetId} onChange={handleProductSelect} />
              ) : (
                <Select label="Select Collection" options={collectionOptions} value={formData.targetId} onChange={handleCollectionSelect} />
              )}
              <Divider />
              <InlineStack align="space-between"><Text variant="headingSm">Intervals</Text><Button icon={PlusIcon} onClick={addPlan}>Add</Button></InlineStack>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <BlockStack gap="400">
              {plans.map((plan, index) => (
                <Box key={index} background="bg-surface-secondary" padding="400" borderRadius="200">
                  <BlockStack gap="300">
                    <InlineStack align="space-between"><Text fontWeight="bold">Plan #{index+1}</Text><Button icon={DeleteIcon} tone="critical" variant="plain" onClick={() => removePlan(index)} /></InlineStack>
                    <InlineStack gap="200">
                      <div style={{flex:1}}><TextField label="Every" type="number" value={plan.intervalCount} onChange={(v)=>updatePlan(index, 'intervalCount', v)} autoComplete="off"/></div>
                      <div style={{flex:1.5}}><Select label="Unit" options={intervalOptions} value={plan.interval} onChange={(v)=>updatePlan(index, 'interval', v)} /></div>
                      <div style={{flex:1}}><TextField label="Discount %" type="number" value={plan.discount} onChange={(v)=>updatePlan(index, 'discount', v)} suffix="%" autoComplete="off"/></div>
                    </InlineStack>
                    <TextField label="Max Charges (Optional)" type="number" value={plan.maxCycles} onChange={(v) => updatePlan(index, 'maxCycles', v)} placeholder="∞" autoComplete="off" />
                  </BlockStack>
                </Box>
              ))}
              </BlockStack>
              </div>
            </FormLayout>
          </Modal.Section>
        </Modal>
      </Page>
    </AppProvider>
  );
}
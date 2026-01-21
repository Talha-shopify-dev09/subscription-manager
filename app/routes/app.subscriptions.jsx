import { useState, useCallback, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
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
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query {
        products(first: 50) { edges { node { id title priceRangeV2 { minVariantPrice { amount } } } } }
        collections(first: 50) { edges { node { id title } } }
      }
    `
  );
  
  const responseJson = await response.json();
  
  const products = responseJson.data.products.edges.map(e => ({
    id: e.node.id, title: e.node.title, price: e.node.priceRangeV2.minVariantPrice.amount
  }));
  
  const collections = responseJson.data.collections.edges.map(e => ({
    id: e.node.id, title: e.node.title
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
  
  // 1. FETCH COLLECTION PRODUCTS (Pagination Support)
  if (actionType === "fetchCollectionProducts") {
    const collectionId = formData.get("collectionId");
    try {
      let allProducts = [];
      let hasNextPage = true;
      let cursor = null;
      
      // Loop until we get EVERY product
      while (hasNextPage) {
        const response = await admin.graphql(
          `#graphql
          query getCollectionProducts($id: ID!, $cursor: String) {
            collection(id: $id) {
              products(first: 250, after: $cursor) {
                pageInfo { hasNextPage endCursor }
                edges { node { id title images(first: 1) { nodes { originalSrc } } } }
              }
            }
          }`,
          { variables: { id: collectionId, cursor } }
        );
        
        const json = await response.json();
        const productsData = json.data?.collection?.products;
        
        if (productsData) {
          const products = productsData.edges.map(e => ({
            id: e.node.id, title: e.node.title, image: e.node.images.nodes[0]?.originalSrc
          }));
          allProducts = [...allProducts, ...products];
          hasNextPage = productsData.pageInfo.hasNextPage;
          cursor = productsData.pageInfo.endCursor;
        } else {
          hasNextPage = false;
        }
      }
      return Response.json({ collectionProducts: allProducts, totalCount: allProducts.length });
    } catch (error) {
      console.error("Collection Fetch Error:", error);
      return Response.json({ error: "Failed to fetch collection" }, { status: 500 });
    }
  }
  
  // 2. DELETE
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

  // 3. CREATE SUBSCRIPTION
  if (actionType === "create") {
    const type = formData.get("type");
    const targetTitle = formData.get("targetTitle");
    const originalPrice = formData.get("originalPrice");
    const plans = JSON.parse(formData.get("plans") || "[]");
    const targetIds = JSON.parse(formData.get("targetIds") || "[]");

    if (targetIds.length === 0) return Response.json({ error: "No products selected" }, { status: 400 });

    // A. Construct Plans
    const sellingPlansToCreate = plans.map((plan, index) => {
      const billingPolicy = {
        recurring: { interval: plan.interval, intervalCount: parseInt(plan.intervalCount) }
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
        billingPolicy,
        deliveryPolicy: { recurring: { interval: plan.interval, intervalCount: parseInt(plan.intervalCount) } },
        pricingPolicies: [{ fixed: { adjustmentType: "PERCENTAGE", adjustmentValue: { percentage: parseFloat(plan.discount) } } }]
      };
    });

    try {
      // B. Create Group (WITHOUT attaching products yet - this prevents the "first one only" bug)
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
        {
          variables: {
            input: {
              name: `Subscription: ${targetTitle}`,
              merchantCode: `sub-${Date.now()}`,
              options: ["Delivery Interval"],
              position: 1,
              sellingPlansToCreate
            }
          }
        }
      );

      const responseJson = await response.json();

      if (responseJson.data?.sellingPlanGroupCreate?.userErrors?.length > 0) {
        return Response.json({ error: responseJson.data.sellingPlanGroupCreate.userErrors }, { status: 400 });
      }

      const newGroup = responseJson.data.sellingPlanGroupCreate.sellingPlanGroup;
      console.log(`✅ Group Created: ${newGroup.id}. Now attaching ${targetIds.length} products...`);

      // C. Explicitly Attach Products (Batching for safety)
      const batchSize = 50; // Safe batch size
      
      for (let i = 0; i < targetIds.length; i += batchSize) {
        const batch = targetIds.slice(i, i + batchSize);
        console.log(`Attaching batch ${i} - ${i + batch.length}`);
        
        await admin.graphql(
          `#graphql
          mutation sellingPlanGroupAddProducts($id: ID!, $productIds: [ID!]!) {
            sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {
              sellingPlanGroup { id }
              userErrors { field message }
            }
          }`,
          { variables: { id: newGroup.id, productIds: batch } }
        );
      }

      // D. Save to DB
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

      await db.subscription.create({
        data: {
          shop: session.shop,
          type, 
          // Always save the first ID or Collection ID as the main reference
          targetId: type === 'collection' ? (formData.get("collectionId") || targetIds[0]) : targetIds[0],
          targetTitle, 
          originalPrice: originalPrice || "0",
          plansData: JSON.stringify(plans),
          shopifyGroupId: newGroup.id,
          shopifyPlanIds: JSON.stringify(shopifyPlanIdsMap),
          enabled: true
        }
      });

      return Response.json({ success: true, productsAttached: targetIds.length });

    } catch (error) {
      console.error("SERVER ERROR:", error);
      return Response.json({ error: "System Error: " + error.message }, { status: 500 });
    }
  }
  
  return Response.json({ success: true });
}

export default function Subscriptions() {
  const { subscriptions, products, collections } = useLoaderData();
  const fetcher = useFetcher();
  const collectionFetcher = useFetcher();
  const shopify = useAppBridge();
  
  const [showModal, setShowModal] = useState(false);
  const [subscriptionType, setSubscriptionType] = useState("product");
  const [plans, setPlans] = useState([{ interval: "MONTH", intervalCount: 1, discount: 10, maxCycles: "" }]);
  
  // UI State
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [selectedTitle, setSelectedTitle] = useState("");
  const [selectedPrice, setSelectedPrice] = useState("");
  const [targetIds, setTargetIds] = useState([]);
  const [previewProducts, setPreviewProducts] = useState([]);

  const isLoading = ["loading", "submitting"].includes(fetcher.state);
  const isLoadingCollection = ["loading", "submitting"].includes(collectionFetcher.state);

  // --- HANDLERS ---
  const addPlan = () => setPlans([...plans, { interval: "MONTH", intervalCount: 1, discount: 0, maxCycles: "" }]);
  const removePlan = (index) => { const n = [...plans]; n.splice(index, 1); setPlans(n); };
  const updatePlan = (index, field, value) => { const n = [...plans]; n[index][field] = value; setPlans(n); };

  const handleCancel = useCallback(() => {
    setShowModal(false); setSubscriptionType("product");
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

  const handleCollectionSelect = useCallback((value) => {
    const collection = collections.find(c => c.id === value);
    if (collection) {
        setSelectedTitle(collection.title);
        setSelectedPrice("N/A");
        setSelectedCollectionId(collection.id);
        
        // Trigger explicit fetch
        const formData = new FormData();
        formData.append("action", "fetchCollectionProducts");
        formData.append("collectionId", collection.id);
        collectionFetcher.submit(formData, { method: "post" });
    }
  }, [collections, collectionFetcher]);

  useEffect(() => {
      if (collectionFetcher.data?.collectionProducts) {
          const prods = collectionFetcher.data.collectionProducts;
          setPreviewProducts(prods);
          setTargetIds(prods.map(p => p.id));
      }
  }, [collectionFetcher.data]);

  const handleSave = useCallback(() => {
    if (targetIds.length === 0) return shopify.toast.show("No products selected", { isError: true });
    
    const data = new FormData();
    data.append("action", "create");
    data.append("type", subscriptionType);
    data.append("targetTitle", selectedTitle);
    data.append("originalPrice", selectedPrice);
    // Explicitly send the list of IDs we gathered
    data.append("targetIds", JSON.stringify(targetIds)); 
    data.append("plans", JSON.stringify(plans));
    if (subscriptionType === 'collection') data.append("collectionId", selectedCollectionId);
    
    fetcher.submit(data, { method: "post" });
  }, [targetIds, subscriptionType, selectedTitle, selectedPrice, plans, fetcher, shopify, selectedCollectionId]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      shopify.toast.show(`Success! Applied to ${fetcher.data.productsAttached} products.`);
      handleCancel();
    }
    if (fetcher.state === "idle" && fetcher.data?.error) {
         // Handle error object or string
         const msg = typeof fetcher.data.error === 'string' ? fetcher.data.error : "Failed to create";
         shopify.toast.show(msg, { isError: true });
    }
  }, [fetcher.state, fetcher.data, handleCancel, shopify]);

  const productOptions = [{ label: 'Select product', value: '' }, ...products.map(p => ({ label: `${p.title}`, value: p.id }))];
  const collectionOptions = [{ label: 'Select collection', value: '' }, ...collections.map(c => ({ label: c.title, value: c.id }))];
  const intervalOptions = [{ label: "Day(s)", value: "DAY" }, { label: "Week(s)", value: "WEEK" }, { label: "Month(s)", value: "MONTH" }, { label: "Year(s)", value: "YEAR" }];

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
                    let plansDisplay = []; try { plansDisplay = JSON.parse(sub.plansData || '[]'); } catch(e){}
                    return (
                      <IndexTable.Row id={sub.id} key={sub.id} position={index}>
                        <IndexTable.Cell><Text fontWeight="bold">{sub.targetTitle}</Text></IndexTable.Cell>
                        <IndexTable.Cell>
                          <InlineStack gap="100" wrap>
                            {plansDisplay.map((p, i) => <Badge key={i} tone="info">Every {p.intervalCount} {p.interval.toLowerCase()}</Badge>)}
                          </InlineStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Button size="slim" tone="critical" onClick={() => { if(confirm("Delete?")) { const d = new FormData(); d.append("action", "delete"); d.append("id", sub.id); d.append("shopifyGroupId", sub.shopifyGroupId); fetcher.submit(d, { method: "post" }); }}}>Delete</Button>
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
              <Select label="Type" options={[{ label: 'Product', value: 'product' }, { label: 'Collection', value: 'collection' }]} value={subscriptionType} onChange={(v) => { setSubscriptionType(v); setTargetIds([]); setPreviewProducts([]); }} />
              
              {subscriptionType === 'product' ? (
                <Select label="Select Product" options={productOptions} onChange={handleProductSelect} />
              ) : (
                <Select label="Select Collection" options={collectionOptions} onChange={handleCollectionSelect} />
              )}
              
              {isLoadingCollection && (
                <Box padding="400"><InlineStack align="center" gap="200"><Spinner size="small" /><Text>Loading products...</Text></InlineStack></Box>
              )}
              
              {previewProducts.length > 0 && !isLoadingCollection && (
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
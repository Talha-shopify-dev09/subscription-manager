import { useState, useCallback, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  AppProvider, Page, Layout, Card, Button, Text, TextField, Select,
  BlockStack, InlineStack, Banner, Badge, IndexTable, Modal, FormLayout,
  EmptyState, Divider, Box, ResourceList, ResourceItem, Thumbnail, Spinner
} from "@shopify/polaris";
import { DeleteIcon, PlusIcon } from "@shopify/polaris-icons";
import enTranslations from "@shopify/polaris/locales/en.json";
import { TitleBar } from "@shopify/app-bridge-react";
import db from "../db.server"; 

// --- LOADER (Standard Load Only) ---
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
      console.error("❌ Collection Fetch Error:", error);
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

    // Construct Plans
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
      // Create Selling Plan Group
      const response = await admin.graphql(
        `#graphql
        mutation sellingPlanGroupCreate($input: SellingPlanGroupInput!, $resources: SellingPlanGroupResourceInput) {
          sellingPlanGroupCreate(input: $input, resources: $resources) {
            sellingPlanGroup { 
              id 
              productCount 
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
            },
            resources: { productIds: targetIds }
          }
        }
      );

      const responseJson = await response.json();

      // --- CRASH PREVENTION CHECK ---
      if (!responseJson.data || !responseJson.data.sellingPlanGroupCreate) {
        console.error("❌ FATAL API ERROR:", JSON.stringify(responseJson));
        return Response.json({ error: "Shopify API Error. Check terminal logs." }, { status: 500 });
      }

      if (responseJson.data.sellingPlanGroupCreate.userErrors.length > 0) {
        console.error("❌ USER ERRORS:", responseJson.data.sellingPlanGroupCreate.userErrors);
        return Response.json({ error: responseJson.data.sellingPlanGroupCreate.userErrors }, { status: 400 });
      }

      const newGroup = responseJson.data.sellingPlanGroupCreate.sellingPlanGroup;

      // Save to DB
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
          // Safe check for targetId to ensure it's not null
          targetId: type === 'collection' ? (formData.get("collectionId") || targetIds[0]) : targetIds[0],
          targetTitle, 
          originalPrice: originalPrice || "0",
          plansData: JSON.stringify(plans),
          shopifyGroupId: newGroup.id,
          shopifyPlanIds: JSON.stringify(shopifyPlanIdsMap),
          enabled: true
        }
      });

      return Response.json({ success: true, productsAttached: newGroup.productCount });

    } catch (error) {
      console.error("❌ SERVER CRASH ERROR:", error);
      return Response.json({ error: "Server Error: " + error.message }, { status: 500 });
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
  const addPlan = () => setPlans([...plans, { interval: "MONTH", intervalCount: 1, discount: 10, maxCycles: "" }]);
  const removePlan = (index) => { const n = [...plans]; n.splice(index, 1); setPlans(n); };
  const updatePlan = (index, field, value) => { const n = [...plans]; n[index][field] = value; setPlans(n); };

  const handleCancel = useCallback(() => {
    setShowModal(false); 
    setSubscriptionType("product");
    setPlans([{ interval: "MONTH", intervalCount: 1, discount: 10, maxCycles: "" }]);
    setTargetIds([]); 
    setPreviewProducts([]); 
    setSelectedTitle(""); 
    setSelectedPrice("");
    setSelectedCollectionId("");
  }, []);

  // 1. Single Product Selected
  const handleProductSelect = useCallback((value) => {
    const product = products.find(p => p.id === value);
    if (product) {
        setTargetIds([product.id]);
        setSelectedTitle(product.title);
        setSelectedPrice(product.price);
        setPreviewProducts([{ id: product.id, title: product.title }]);
    }
  }, [products]);

  // 2. Collection Selected
  const handleCollectionSelect = useCallback((value) => {
    const collection = collections.find(c => c.id === value);
    if (collection) {
        setSelectedCollectionId(collection.id);
        setSelectedTitle(collection.title);
        setSelectedPrice("N/A");
        setPreviewProducts([]);
        setTargetIds([]);
        
        const formData = new FormData();
        formData.append("action", "fetchCollectionProducts");
        formData.append("collectionId", collection.id);
        collectionFetcher.submit(formData, { method: "post" });
    }
  }, [collections, collectionFetcher]);

  // 3. Listen for Collection Fetch Results
  useEffect(() => {
      if (collectionFetcher.data?.collectionProducts) {
          const prods = collectionFetcher.data.collectionProducts;
          console.log(`Frontend received ${prods.length} products`);
          setPreviewProducts(prods);
          const ids = prods.map(p => p.id);
          console.log(`Setting targetIds:`, ids);
          setTargetIds(ids);
          
          if (collectionFetcher.data.totalCount) {
              shopify.toast.show(`Loaded ${collectionFetcher.data.totalCount} products from collection`);
          }
      }
      
      if (collectionFetcher.data?.error) {
          shopify.toast.show(collectionFetcher.data.error, { isError: true });
      }
  }, [collectionFetcher.data, shopify]);

  const handleSave = useCallback(() => {
    // Validation
    if (targetIds.length === 0) {
      return shopify.toast.show("No products selected", { isError: true });
    }
    
    if (plans.length === 0) {
      return shopify.toast.show("Add at least one subscription plan", { isError: true });
    }
    
    if (plans.some(p => !p.discount || p.discount < 0 || p.discount > 100)) {
      return shopify.toast.show("Discount must be between 0 and 100%", { isError: true });
    }
    
    console.log(`Submitting subscription with ${targetIds.length} products:`, targetIds);
    
    const data = new FormData();
    data.append("action", "create");
    data.append("type", subscriptionType);
    data.append("targetTitle", selectedTitle);
    data.append("originalPrice", selectedPrice);
    data.append("targetIds", JSON.stringify(targetIds));
    data.append("plans", JSON.stringify(plans));
    if (subscriptionType === 'collection') {
      data.append("collectionId", selectedCollectionId);
    }
    
    fetcher.submit(data, { method: "post" });
  }, [targetIds, subscriptionType, selectedTitle, selectedPrice, plans, fetcher, shopify, selectedCollectionId]);

  // Handle successful save
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      const count = fetcher.data.productsAttached || targetIds.length;
      shopify.toast.show(`✅ Subscription applied to ${count} product(s)!`, { duration: 5000 });
      handleCancel();
    }
    
    if (fetcher.state === "idle" && fetcher.data?.error) {
      const errorMsg = Array.isArray(fetcher.data.error) 
        ? fetcher.data.error.map(e => e.message).join(", ")
        : "Failed to create subscription";
      shopify.toast.show(errorMsg, { isError: true });
    }
  }, [fetcher.state, fetcher.data, handleCancel, shopify, targetIds.length]);

  const productOptions = [{ label: 'Select product', value: '' }, ...products.map(p => ({ label: `${p.title}`, value: p.id }))];
  const collectionOptions = [{ label: 'Select collection', value: '' }, ...collections.map(c => ({ label: c.title, value: c.id }))];
  const intervalOptions = [
    { label: "Day(s)", value: "DAY" }, 
    { label: "Week(s)", value: "WEEK" }, 
    { label: "Month(s)", value: "MONTH" }, 
    { label: "Year(s)", value: "YEAR" }
  ];

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
                <EmptyState 
                  heading="No subscriptions yet" 
                  action={{ content: 'Create Subscription', onAction: () => setShowModal(true) }} 
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Create your first subscription plan for products or collections.</p>
                </EmptyState>
              ) : (
                <IndexTable 
                  resourceName={{ singular: 'subscription', plural: 'subscriptions' }} 
                  itemCount={subscriptions.length} 
                  headings={[
                    { title: 'Target' }, 
                    { title: 'Type' }, 
                    { title: 'Plans' }, 
                    { title: 'Action' }
                  ]}
                  selectable={false}
                >
                  {subscriptions.map((sub, index) => {
                    let plansDisplay = []; 
                    try { plansDisplay = JSON.parse(sub.plansData || '[]'); } catch(e){}
                    return (
                      <IndexTable.Row id={sub.id} key={sub.id} position={index}>
                        <IndexTable.Cell>
                          <BlockStack gap="100">
                            <Text fontWeight="bold">{sub.targetTitle}</Text>
                            <Text variant="bodySm" tone="subdued">{sub.type}</Text>
                          </BlockStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge tone={sub.type === 'collection' ? 'info' : 'success'}>
                            {sub.type}
                          </Badge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <BlockStack gap="100">
                            {plansDisplay.map((p, i) => (
                              <Text key={i} variant="bodySm">
                                Every {p.intervalCount} {p.interval.toLowerCase()}(s) - {p.discount}% off
                              </Text>
                            ))}
                          </BlockStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Button 
                            size="slim" 
                            tone="critical" 
                            onClick={() => { 
                              if(confirm(`Delete subscription for "${sub.targetTitle}"?`)) { 
                                const d = new FormData(); 
                                d.append("action", "delete"); 
                                d.append("id", sub.id); 
                                d.append("shopifyGroupId", sub.shopifyGroupId); 
                                fetcher.submit(d, { method: "post" }); 
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    );
                  })}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>
        </Layout>
        
        <Modal 
          open={showModal} 
          onClose={handleCancel} 
          title="Create Subscription Plan" 
          primaryAction={{ 
            content: targetIds.length > 0 ? `Apply to ${targetIds.length} product(s)` : 'Save Subscription', 
            onAction: handleSave, 
            loading: isLoading,
            disabled: targetIds.length === 0 || isLoadingCollection
          }}
          secondaryActions={[{
            content: 'Cancel',
            onAction: handleCancel
          }]}
        >
          <Modal.Section>
            <FormLayout>
              <Select 
                label="Apply subscription to" 
                options={[
                  { label: 'Single Product', value: 'product' }, 
                  { label: 'All Products in Collection', value: 'collection' }
                ]} 
                value={subscriptionType} 
                onChange={(v) => { 
                  setSubscriptionType(v); 
                  setTargetIds([]); 
                  setPreviewProducts([]); 
                  setSelectedTitle("");
                  setSelectedPrice("");
                  setSelectedCollectionId("");
                }} 
              />
              
              {/* SELECTOR */}
              {subscriptionType === 'product' ? (
                <Select 
                  label="Select Product" 
                  options={productOptions} 
                  onChange={handleProductSelect} 
                />
              ) : (
                <Select 
                  label="Select Collection" 
                  options={collectionOptions} 
                  onChange={handleCollectionSelect} 
                />
              )}
              
              {/* LOADING SPINNER */}
              {isLoadingCollection && (
                <Box padding="400">
                  <InlineStack align="center" gap="200">
                    <Spinner size="small" />
                    <Text>Loading all products from collection...</Text>
                  </InlineStack>
                </Box>
              )}
              
              {/* PREVIEW OF SELECTED PRODUCTS */}
              {previewProducts.length > 0 && !isLoadingCollection && (
                  <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Text variant="headingSm" fontWeight="bold">
                            {previewProducts.length} product(s) will receive subscription
                          </Text>
                          <Badge tone="success">Ready</Badge>
                        </InlineStack>
                        <Divider />
                        <div style={{maxHeight: '200px', overflowY: 'auto'}}>
                            <BlockStack gap="200">
                                {previewProducts.slice(0, 10).map(p => (
                                    <InlineStack key={p.id} align="start" gap="200" blockAlign="center">
                                        {p.image && <Thumbnail source={p.image} size="small" alt={p.title}/>}
                                        <Text variant="bodySm">{p.title}</Text>
                                    </InlineStack>
                                ))}
                                {previewProducts.length > 10 && (
                                  <Text variant="bodySm" tone="subdued" fontWeight="semibold">
                                    + {previewProducts.length - 10} more products...
                                  </Text>
                                )}
                            </BlockStack>
                        </div>
                      </BlockStack>
                  </Box>
              )}

              <Divider />
              
              <InlineStack align="space-between">
                <Text variant="headingSm">Subscription Plans</Text>
                <Button icon={PlusIcon} onClick={addPlan}>Add Plan</Button>
              </InlineStack>
              
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <BlockStack gap="400">
                  {plans.map((plan, index) => (
                    <Box key={index} background="bg-surface-secondary" padding="400" borderRadius="200">
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Text fontWeight="bold">Plan #{index+1}</Text>
                          {plans.length > 1 && (
                            <Button 
                              icon={DeleteIcon} 
                              tone="critical" 
                              variant="plain" 
                              onClick={() => removePlan(index)} 
                            />
                          )}
                        </InlineStack>
                        <InlineStack gap="200">
                          <div style={{flex:1}}>
                            <TextField 
                              label="Every" 
                              type="number" 
                              value={String(plan.intervalCount)} 
                              onChange={(v)=>updatePlan(index, 'intervalCount', v)} 
                              autoComplete="off"
                              min="1"
                            />
                          </div>
                          <div style={{flex:1.5}}>
                            <Select 
                              label="Period" 
                              options={intervalOptions} 
                              value={plan.interval} 
                              onChange={(v)=>updatePlan(index, 'interval', v)} 
                            />
                          </div>
                          <div style={{flex:1}}>
                            <TextField 
                              label="Discount" 
                              type="number" 
                              value={String(plan.discount)} 
                              onChange={(v)=>updatePlan(index, 'discount', v)} 
                              suffix="%" 
                              autoComplete="off"
                              min="0"
                              max="100"
                            />
                          </div>
                        </InlineStack>
                        <TextField 
                          label="Max Billing Cycles (Optional)" 
                          type="number" 
                          value={plan.maxCycles} 
                          onChange={(v) => updatePlan(index, 'maxCycles', v)} 
                          placeholder="Unlimited" 
                          autoComplete="off"
                          helpText="Leave empty for unlimited recurring billing"
                        />
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
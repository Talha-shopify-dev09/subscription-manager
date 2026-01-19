import { useState, useCallback, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  AppProvider,
  Page,
  Layout,
  Card,
  Button,
  Text,
  TextField,
  Select,
  BlockStack,
  InlineStack,
  Banner,
  Badge,
  IndexTable,
  Modal,
  FormLayout,
  EmptyState,
  Divider,
  Box,
  Scrollable
} from "@shopify/polaris";
import { DeleteIcon, PlusIcon } from "@shopify/polaris-icons";
import enTranslations from "@shopify/polaris/locales/en.json";
import { TitleBar } from "@shopify/app-bridge-react";
import db from "../db.server"; // Import Prisma DB directly for safety

// --- LOADER: Fetch Products & Collections & Subscriptions ---
export async function loader({ request }) {
  await authenticate.admin(request);
  
  // 1. Fetch Products & Collections from Shopify
  // (Keeping your existing GraphQL query)
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
              priceRangeV2 { minVariantPrice { amount } }
            }
          }
        }
        collections(first: 50) {
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
  
  // 2. Fetch Subscriptions from DB
  const subscriptions = await db.subscription.findMany({
    orderBy: { createdAt: 'desc' }
  });
  
  return { subscriptions, products, collections };
}

// --- ACTION: Handle Create/Delete logic ---
export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");
  
  // 1. DELETE SUBSCRIPTION
  if (actionType === "delete") {
    const id = formData.get("id");
    const shopifyGroupId = formData.get("shopifyGroupId");

    if (shopifyGroupId) {
      try {
        await admin.graphql(
          `#graphql
          mutation sellingPlanGroupDelete($id: ID!) {
            sellingPlanGroupDelete(id: $id) {
              deletedSellingPlanGroupId
              userErrors { field message }
            }
          }`,
          { variables: { id: shopifyGroupId } }
        );
      } catch (err) {
        console.error("Failed to delete from Shopify:", err);
      }
    }

    await db.subscription.delete({ where: { id } });
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  }

  // 2. TOGGLE STATUS
  if (actionType === "toggle") {
    const id = formData.get("id");
    const sub = await db.subscription.findUnique({ where: { id } });
    await db.subscription.update({
      where: { id },
      data: { enabled: !sub.enabled }
    });
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  }

  // 3. CREATE SUBSCRIPTION (UPDATED FOR DYNAMIC PLANS)
  if (actionType === "create") {
    const type = formData.get("type");
    const targetId = formData.get("targetId");
    const targetTitle = formData.get("targetTitle");
    const originalPrice = formData.get("originalPrice");
    
    // Parse the JSON string back into an array
    const plans = JSON.parse(formData.get("plans") || "[]");

    // Construct "sellingPlansToCreate" for Shopify API
    const sellingPlansToCreate = plans.map((plan, index) => ({
      name: `Deliver every ${plan.intervalCount} ${plan.interval.toLowerCase()}(s) (Save ${plan.discount}%)`,
      options: [`Every ${plan.intervalCount} ${plan.interval.toLowerCase()}(s)`],
      position: index + 1,
      category: "SUBSCRIPTION", 
      billingPolicy: {
        recurring: { interval: plan.interval, intervalCount: parseInt(plan.intervalCount) }
      },
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
    }));

    // Step A: Create the Selling Plan Group in Shopify
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
                  name
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
      return new Response(
        JSON.stringify({ error: responseJson.data.sellingPlanGroupCreate.userErrors }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const newGroup = responseJson.data.sellingPlanGroupCreate.sellingPlanGroup;

    // Step B: Attach Products or Collection
    if (type === "product") {
      await admin.graphql(
        `#graphql
        mutation productJoinSellingPlanGroups($id: ID!, $sellingPlanGroupIds: [ID!]!) {
          productJoinSellingPlanGroups(id: $id, sellingPlanGroupIds: $sellingPlanGroupIds) {
            product { id }
          }
        }`,
        { variables: { id: targetId, sellingPlanGroupIds: [newGroup.id] } }
      );
    } else if (type === "collection") {
      const collectionQuery = await admin.graphql(
        `#graphql
        query getCollectionProducts($id: ID!) {
          collection(id: $id) {
            products(first: 250) {
              edges { node { id } }
            }
          }
        }`,
        { variables: { id: targetId } }
      );
      
      const collectionData = await collectionQuery.json();
      const productIds = collectionData.data.collection?.products?.edges.map(edge => edge.node.id) || [];

      if (productIds.length > 0) {
        await admin.graphql(
          `#graphql
          mutation sellingPlanGroupAddProducts($id: ID!, $productIds: [ID!]!) {
            sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {
              sellingPlanGroup { id }
            }
          }`,
          { variables: { id: newGroup.id, productIds: productIds } }
        );
      }
    }

    // Step C: Map Created Shopify IDs back to our Plans
    // We match them based on interval/count to be safe
    const shopifyPlanIdsMap = {};
    
    // We loop through the Created Plans from Shopify
    newGroup.sellingPlans.edges.forEach(({ node }) => {
       const interval = node.billingPolicy.interval;
       const count = node.billingPolicy.intervalCount;
       
       // Find which local plan this matches (1-based index key)
       plans.forEach((p, index) => {
          if (p.interval === interval && parseInt(p.intervalCount) === count) {
             shopifyPlanIdsMap[index + 1] = node.id;
          }
       });
    });

    // Step D: Save to Local DB
    await db.subscription.create({
      data: {
        type,
        targetId,
        targetTitle,
        originalPrice: originalPrice || "0",
        plansData: JSON.stringify(plans), // Save the array of settings
        shopifyGroupId: newGroup.id,
        shopifyPlanIds: JSON.stringify(shopifyPlanIdsMap), // Save the map of IDs
        enabled: true
      }
    });
  }
  
  return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
}

// --- REACT COMPONENT ---
export default function Subscriptions() {
  const { subscriptions, products, collections } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  
  const [showModal, setShowModal] = useState(false);
  const [subscriptionType, setSubscriptionType] = useState("product");
  
  // --- STATE FOR DYNAMIC PLANS ---
  const [plans, setPlans] = useState([
    { interval: "MONTH", intervalCount: 1, discount: 10 }
  ]);

  const [formData, setFormData] = useState({
    targetId: "",
    targetTitle: "",
    originalPrice: ""
  });

  const isLoading = ["loading", "submitting"].includes(fetcher.state);

  // --- HELPERS FOR PLANS ---
  const addPlan = () => {
    setPlans([...plans, { interval: "MONTH", intervalCount: 1, discount: 0 }]);
  };

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
    setPlans([{ interval: "MONTH", intervalCount: 1, discount: 10 }]); // Reset to default
    setFormData({
      targetId: "",
      targetTitle: "",
      originalPrice: ""
    });
  }, []);

  const handleProductSelect = useCallback((value) => {
    const product = products.find(p => p.id === value);
    if (product) {
      setFormData(prev => ({
        ...prev,
        targetId: product.id,
        targetTitle: product.title,
        originalPrice: product.price
      }));
    }
  }, [products]);

  const handleCollectionSelect = useCallback((value) => {
    const collection = collections.find(c => c.id === value);
    if (collection) {
      setFormData(prev => ({
        ...prev,
        targetId: collection.id,
        targetTitle: collection.title,
        originalPrice: "N/A"
      }));
    }
  }, [collections]);

  const handleSave = useCallback(() => {
    if (!formData.targetId) {
      shopify.toast.show("Please select a product or collection", { isError: true });
      return;
    }

    const data = new FormData();
    data.append("action", "create");
    data.append("type", subscriptionType);
    data.append("targetId", formData.targetId);
    data.append("targetTitle", formData.targetTitle);
    data.append("originalPrice", formData.originalPrice);
    
    // SEND PLANS AS JSON
    data.append("plans", JSON.stringify(plans));
    
    fetcher.submit(data, { method: "post" });
  }, [formData, subscriptionType, plans, fetcher, shopify]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.success) {
        shopify.toast.show("Subscription created successfully!");
        handleCancel();
      } else if (fetcher.data.error) {
        console.error("Subscription Error:", fetcher.data.error);
        const msg = JSON.stringify(fetcher.data.error);
        shopify.toast.show(`Failed to create: ${msg}`, { isError: true });
      }
    }
  }, [fetcher.state, fetcher.data, handleCancel, shopify]);

  const handleDelete = useCallback((id, shopifyGroupId) => {
    if (confirm("Are you sure? This will remove the plan from Shopify.")) {
      const data = new FormData();
      data.append("action", "delete");
      data.append("id", id);
      if (shopifyGroupId) data.append("shopifyGroupId", shopifyGroupId);
      fetcher.submit(data, { method: "post" });
    }
  }, [fetcher]);

  const handleToggle = useCallback((id) => {
    const data = new FormData();
    data.append("action", "toggle");
    data.append("id", id);
    fetcher.submit(data, { method: "post" });
  }, [fetcher]);

  const productOptions = [
    { label: 'Select a product', value: '' },
    ...products.map(p => ({ label: `${p.title} ($${p.price})`, value: p.id }))
  ];
  
  const collectionOptions = [
    { label: 'Select a collection', value: '' },
    ...collections.map(c => ({ label: c.title, value: c.id }))
  ];

  const intervalOptions = [
    { label: "Day(s)", value: "DAY" },
    { label: "Week(s)", value: "WEEK" },
    { label: "Month(s)", value: "MONTH" },
    { label: "Year(s)", value: "ANNUAL" },
  ];

  return (
    <AppProvider i18n={enTranslations}>
      <Page>
        <TitleBar title="Subscription Manager">
          <button variant="primary" onClick={() => setShowModal(true)}>
            Create Subscription
          </button>
        </TitleBar>

        <Layout>
          <Layout.Section>
            <Banner tone="info">
              <p>Create flexible subscription plans (e.g., Every 4 Days, Every 2 Weeks) and attach them to your products.</p>
            </Banner>
          </Layout.Section>

          <Layout.Section>
            <Card padding="0">
              {subscriptions.length === 0 ? (
                <EmptyState
                  heading="No subscriptions yet"
                  action={{ content: 'Create Subscription', onAction: () => setShowModal(true) }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Create your first subscription plan to get started.</p>
                </EmptyState>
              ) : (
                <IndexTable
                  resourceName={{ singular: 'subscription', plural: 'subscriptions' }}
                  itemCount={subscriptions.length}
                  headings={[
                    { title: 'Product/Collection' },
                    { title: 'Plans Created' },
                    { title: 'Status' },
                    { title: 'Actions' },
                  ]}
                >
                  {subscriptions.map((sub, index) => {
                    // Safe parse plans
                    let plansDisplay = [];
                    try { plansDisplay = JSON.parse(sub.plansData || '[]'); } catch(e){}

                    return (
                      <IndexTable.Row id={sub.id} key={sub.id} position={index}>
                        <IndexTable.Cell>
                          <Text variant="bodyMd" fontWeight="bold" as="span">{sub.targetTitle}</Text>
                          {sub.shopifyGroupId && <Badge tone="info">Synced</Badge>}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <InlineStack gap="100" wrap>
                             {plansDisplay.map((p, i) => (
                               <Badge key={i} tone="new">
                                 {p.intervalCount} {p.interval}(s) - {p.discount}% Off
                               </Badge>
                             ))}
                          </InlineStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          {sub.enabled ? <Badge tone="success">Active</Badge> : <Badge>Disabled</Badge>}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <InlineStack gap="200">
                            <Button size="slim" onClick={() => handleToggle(sub.id)}>
                              {sub.enabled ? "Disable" : "Enable"}
                            </Button>
                            <Button size="slim" tone="critical" onClick={() => handleDelete(sub.id, sub.shopifyGroupId)}>
                              Delete
                            </Button>
                          </InlineStack>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    );
                  })}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>
        </Layout>

        {/* --- MODAL FORM --- */}
        <Modal
          open={showModal}
          onClose={handleCancel}
          title="Create Subscription Plan"
          primaryAction={{
            content: 'Save Subscription',
            onAction: handleSave,
            loading: isLoading,
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: handleCancel,
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              {/* Target Section */}
              <Select
                label="Subscription Type"
                options={[
                  { label: 'Single Product', value: 'product' },
                  { label: 'Entire Collection', value: 'collection' },
                ]}
                value={subscriptionType}
                onChange={setSubscriptionType}
              />

              {subscriptionType === 'product' ? (
                <Select
                  label="Select Product"
                  options={productOptions}
                  value={formData.targetId}
                  onChange={handleProductSelect}
                  placeholder="Search or select a product"
                />
              ) : (
                <Select
                  label="Select Collection"
                  options={collectionOptions}
                  value={formData.targetId}
                  onChange={handleCollectionSelect}
                />
              )}
              
              <Divider />
              
              {/* Dynamic Plans Section */}
              <InlineStack align="space-between">
                 <Text variant="headingSm" as="h3">Subscription Intervals</Text>
                 <Button icon={PlusIcon} onClick={addPlan} variant="plain">Add Interval</Button>
              </InlineStack>
              
              <Box paddingBlockEnd="200">
                <Text tone="subdued" as="p" variant="bodyXs">
                  Define how often the customer will be charged and what discount they get.
                </Text>
              </Box>

              <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '5px' }}>
              <BlockStack gap="400">
              {plans.map((plan, index) => (
                <div key={index} style={{ background: "#f7f7f7", padding: "10px", borderRadius: "8px", border: "1px solid #e1e1e1" }}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                       <Text variant="bodySm" fontWeight="bold">Plan #{index + 1}</Text>
                       {plans.length > 1 && (
                         <Button icon={DeleteIcon} tone="critical" variant="plain" onClick={() => removePlan(index)} />
                       )}
                    </InlineStack>

                    <InlineStack gap="200" align="start">
                        {/* Interval Count */}
                        <div style={{ flex: 1 }}>
                          <TextField
                            label="Every"
                            type="number"
                            value={plan.intervalCount}
                            onChange={(v) => updatePlan(index, 'intervalCount', v)}
                            autoComplete="off"
                            min={1}
                          />
                        </div>

                        {/* Interval Type */}
                        <div style={{ flex: 1.5 }}>
                          <Select
                            label="Unit"
                            options={intervalOptions}
                            value={plan.interval}
                            onChange={(v) => updatePlan(index, 'interval', v)}
                          />
                        </div>

                        {/* Discount */}
                        <div style={{ flex: 1 }}>
                          <TextField
                            label="Discount %"
                            type="number"
                            value={plan.discount}
                            onChange={(v) => updatePlan(index, 'discount', v)}
                            suffix="%"
                            autoComplete="off"
                          />
                        </div>
                    </InlineStack>
                  </BlockStack>
                </div>
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
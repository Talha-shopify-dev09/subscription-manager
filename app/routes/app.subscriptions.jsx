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
  Divider
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  getAllSubscriptions,
  createSubscription,
  deleteSubscription,
  toggleSubscription
} from "../models/subscriptions.server";

// --- LOADER: Fetch Products & Collections ---
export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  
  const response = await admin.graphql(
    `#graphql
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
              priceRangeV2 {
                minVariantPrice { amount }
              }
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
  
  return { 
    subscriptions: await getAllSubscriptions(),
    products,
    collections
  };
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

    await deleteSubscription(id);
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  }

  // 2. TOGGLE STATUS
  if (actionType === "toggle") {
    const id = formData.get("id");
    await toggleSubscription(id);
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  }

  // 3. CREATE SUBSCRIPTION
  if (actionType === "create") {
    const type = formData.get("type");
    const targetId = formData.get("targetId");
    const targetTitle = formData.get("targetTitle");
    const originalPrice = formData.get("originalPrice");
    
    const discounts = {
      1: formData.get("oneMonthDiscount") || "0",
      2: formData.get("twoMonthDiscount") || "0",
      3: formData.get("threeMonthDiscount") || "0"
    };

    // Construct Plans with "category: SUBSCRIPTION"
    const sellingPlans = [1, 2, 3].map(month => ({
      name: `Deliver every ${month} Month${month > 1 ? 's' : ''} (Save ${discounts[month]}%)`,
      options: [`${month} Month${month > 1 ? 's' : ''}`],
      position: month,
      category: "SUBSCRIPTION", 
      billingPolicy: {
        recurring: { interval: "MONTH", intervalCount: month }
      },
      deliveryPolicy: {
        recurring: { interval: "MONTH", intervalCount: month }
      },
      pricingPolicies: [
        {
          fixed: {
            adjustmentType: "PERCENTAGE",
            adjustmentValue: { percentage: parseFloat(discounts[month]) }
          }
        }
      ]
    }));

    // Step A: Create the Selling Plan Group
    const response = await admin.graphql(
      `#graphql
      mutation sellingPlanGroupCreate($input: SellingPlanGroupInput!) {
        sellingPlanGroupCreate(input: $input) {
          sellingPlanGroup {
            id
            sellingPlans(first: 5) {
              edges {
                node {
                  id
                  name
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
            sellingPlansToCreate: sellingPlans
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
      // Case 1: Single Product
      await admin.graphql(
        `#graphql
        mutation productJoinSellingPlanGroups($id: ID!, $sellingPlanGroupIds: [ID!]!) {
          productJoinSellingPlanGroups(id: $id, sellingPlanGroupIds: $sellingPlanGroupIds) {
            product { id }
            userErrors { field message }
          }
        }`,
        { variables: { id: targetId, sellingPlanGroupIds: [newGroup.id] } }
      );
    } else if (type === "collection") {
      // Case 2: Entire Collection
      // First, fetch the products in this collection
      const collectionQuery = await admin.graphql(
        `#graphql
        query getCollectionProducts($id: ID!) {
          collection(id: $id) {
            products(first: 250) {
              edges {
                node { id }
              }
            }
          }
        }`,
        { variables: { id: targetId } }
      );
      
      const collectionData = await collectionQuery.json();
      const productIds = collectionData.data.collection?.products?.edges.map(edge => edge.node.id) || [];

      // Then, attach the plan group to all those products
      if (productIds.length > 0) {
        await admin.graphql(
          `#graphql
          mutation sellingPlanGroupAddProducts($id: ID!, $productIds: [ID!]!) {
            sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {
              sellingPlanGroup { id }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              id: newGroup.id,
              productIds: productIds
            }
          }
        );
      }
    }

    // Step C: Save to Local DB
    const plansMap = {};
    newGroup.sellingPlans.edges.forEach(({ node }) => {
      if (node.name.includes("1 Month")) plansMap["1"] = node.id;
      if (node.name.includes("2 Month")) plansMap["2"] = node.id;
      if (node.name.includes("3 Month")) plansMap["3"] = node.id;
    });

    const subscriptionData = {
      type,
      targetId,
      targetTitle,
      originalPrice,
      oneMonthDiscount: discounts[1],
      twoMonthDiscount: discounts[2],
      threeMonthDiscount: discounts[3],
      shopifyGroupId: newGroup.id,
      shopifyPlanIds: plansMap
    };
    
    await createSubscription(subscriptionData);
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
  const [formData, setFormData] = useState({
    targetId: "",
    targetTitle: "",
    originalPrice: "",
    oneMonthDiscount: "",
    twoMonthDiscount: "",
    threeMonthDiscount: ""
  });

  const isLoading = ["loading", "submitting"].includes(fetcher.state);

  const handleCancel = useCallback(() => {
    setShowModal(false);
    setSubscriptionType("product");
    setFormData({
      targetId: "",
      targetTitle: "",
      originalPrice: "",
      oneMonthDiscount: "",
      twoMonthDiscount: "",
      threeMonthDiscount: ""
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
    data.append("oneMonthDiscount", formData.oneMonthDiscount);
    data.append("twoMonthDiscount", formData.twoMonthDiscount);
    data.append("threeMonthDiscount", formData.threeMonthDiscount);
    
    fetcher.submit(data, { method: "post" });
  }, [formData, subscriptionType, fetcher, shopify]);

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
              <p>Create plans here. This will automatically generate Selling Plans in Shopify and sync them to your product.</p>
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
                    { title: 'Discounts (1m/2m/3m)' },
                    { title: 'Status' },
                    { title: 'Actions' },
                  ]}
                >
                  {subscriptions.map((sub, index) => (
                    <IndexTable.Row id={sub.id} key={sub.id} position={index}>
                      <IndexTable.Cell>
                        <Text variant="bodyMd" fontWeight="bold" as="span">{sub.targetTitle}</Text>
                        {sub.shopifyGroupId && <Badge tone="info">Synced</Badge>}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {sub.oneMonthDiscount}% / {sub.twoMonthDiscount}% / {sub.threeMonthDiscount}%
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
                  ))}
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
              
              {/* Discount Section */}
              <Text variant="headingSm" as="h3">Discount Rules</Text>
              
              <FormLayout.Group>
                <TextField
                  label="1 Month Discount"
                  type="number"
                  value={formData.oneMonthDiscount}
                  onChange={(val) => setFormData(prev => ({ ...prev, oneMonthDiscount: val }))}
                  suffix="%"
                  autoComplete="off"
                  helpText="e.g. 5"
                />
                <TextField
                  label="2 Month Discount"
                  type="number"
                  value={formData.twoMonthDiscount}
                  onChange={(val) => setFormData(prev => ({ ...prev, twoMonthDiscount: val }))}
                  suffix="%"
                  autoComplete="off"
                  helpText="e.g. 10"
                />
                <TextField
                  label="3 Month Discount"
                  type="number"
                  value={formData.threeMonthDiscount}
                  onChange={(val) => setFormData(prev => ({ ...prev, threeMonthDiscount: val }))}
                  suffix="%"
                  autoComplete="off"
                  helpText="e.g. 15"
                />
              </FormLayout.Group>
            </FormLayout>
          </Modal.Section>
        </Modal>
      </Page>
    </AppProvider>
  );
}
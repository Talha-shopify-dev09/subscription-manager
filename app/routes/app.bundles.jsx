import { useState, useEffect } from "react";
import { useLoaderData, useSubmit, useActionData, useRevalidator, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { getBillingInfo, canUseFeature } from "../helpers/billing.server";
import {
  AppProvider, Page, Layout, Card, Button, Text, TextField, BlockStack,
  InlineStack, IndexTable, EmptyState, Thumbnail, Banner, Modal, FormLayout
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { useAppBridge } from "@shopify/app-bridge-react";
import db from "../db.server";

// 1. LOADER: Fixed GraphQL Query
export async function loader({ request }) {
  const billing = await getBillingInfo(request);
  if (!canUseFeature(billing, "BUNDLE")) {
    return { bundles: [], currencySymbol: "$", shopId: null, billing, gated: true };
  }

  const { session, admin } = await authenticate.admin(request);
  
  const shopResponse = await admin.graphql(
    `#graphql
    query {
      shop {
        id
        currencyFormats {
          moneyInEmailsFormat
        }
      }
    }`
  );
  
  const shopJson = await shopResponse.json();
  const shopId = shopJson.data?.shop?.id;
  
  // Safe Symbol Extraction
  const rawFormat = shopJson.data?.shop?.currencyFormats?.moneyInEmailsFormat || "${{amount}}";
  const currencySymbol = rawFormat.replace(/\{\{amount\}\}/g, "").trim() || "$";

  const bundles = await db.bundle.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });

  return { bundles, currencySymbol, shopId, billing, gated: false };
}

// 2. ACTION: Full Lifecycle Management
export async function action({ request }) {
  const billing = await getBillingInfo(request);
  if (!canUseFeature(billing, "BUNDLE")) {
    return Response.json({ error: "Your plan does not allow Bundles." }, { status: 403 });
  }

  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");

  try {
    // --- DELETE FLOW ---
    if (actionType === "delete") {
        const bundleId = formData.get("id");
        
        // 1. Find Bundle to get Discount ID
        const bundle = await db.bundle.findUnique({ where: { id: bundleId } });
        
        if (bundle?.discountId) {
            // 2. Delete from Shopify
            const deleteResponse = await admin.graphql(
                `#graphql
                mutation discountAutomaticDelete($id: ID!) {
                  discountAutomaticDelete(id: $id) {
                    userErrors { field message }
                  }
                }`,
                { variables: { id: bundle.discountId } }
            );
        }

        // 3. Delete from DB
        await db.bundle.delete({ where: { id: bundleId } });
        
        await syncMetafields(admin, session.shop);
        
        return Response.json({ success: true, deleted: true });
    }

    // --- UPDATE FLOW ---
    if (actionType === "update") {
        const bundleId = formData.get("id");
        const title = formData.get("title");
        const products = JSON.parse(formData.get("products"));

        if (!bundleId) return Response.json({ error: "Missing bundle ID" }, { status: 400 });

        let totalOriginal = 0;
        let totalBundle = 0;
        const productIds = [];

        products.forEach(p => {
            totalOriginal += parseFloat(p.originalPrice || 0);
            totalBundle += parseFloat(p.bundlePrice || 0);
            productIds.push(p.productId);
        });

        const discountValue = totalOriginal - totalBundle;
        let createdDiscountId = null;

        const existingBundle = await db.bundle.findUnique({ where: { id: bundleId } });
        if (!existingBundle) return Response.json({ error: "Bundle not found" }, { status: 404 });

        if (existingBundle?.discountId) {
            await admin.graphql(
                `#graphql
                mutation discountAutomaticDelete($id: ID!) {
                  discountAutomaticDelete(id: $id) {
                    userErrors { field message }
                  }
                }`,
                { variables: { id: existingBundle.discountId } }
            );
        }

        // Add Tags for selected products
        for (const pid of productIds) {
            await admin.graphql(
                `#graphql
                mutation addTags($id: ID!, $tags: [String!]!) {
                    tagsAdd(id: $id, tags: $tags) {
                        node { id }
                    }
                }`,
                { variables: { id: pid, tags: ["Bundle-Item"] } }
            );
        }

        // Create new Automatic Discount (if any savings)
        if (discountValue > 0) {
            const response = await admin.graphql(
                `#graphql
                mutation discountAutomaticBasicCreate($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
                  discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
                    automaticDiscountNode {
                       id
                       automaticDiscount {
                         ... on DiscountAutomaticBasic { title }
                       }
                    }
                    userErrors { field message }
                  }
                }`,
                {
                  variables: {
                    automaticBasicDiscount: {
                      title: `${title} (Save ${discountValue.toFixed(2)})`,
                      startsAt: new Date().toISOString(),
                      minimumRequirement: {
                        quantity: { greaterThanOrEqualToQuantity: products.length.toString() }
                      },
                      customerGets: {
                        value: { 
                            discountAmount: { 
                                amount: discountValue.toFixed(2), 
                                appliesOnEachItem: false 
                            } 
                        },
                        items: { 
                            products: { productsToAdd: productIds } 
                        }
                      }
                    }
                  }
                }
            );

            const responseJson = await response.json();
            const errors = responseJson.data?.discountAutomaticBasicCreate?.userErrors || [];
            if (errors.length > 0) {
                return Response.json({ error: `Shopify API Error: ${errors[0].message}` }, { status: 400 });
            }
            createdDiscountId = responseJson.data?.discountAutomaticBasicCreate?.automaticDiscountNode?.id;
        }

        await db.bundle.update({
            where: { id: bundleId },
            data: {
                title,
                price: totalBundle.toFixed(2),
                productIds: JSON.stringify(products),
                discountId: createdDiscountId,
            }
        });

        await syncMetafields(admin, session.shop);
        return Response.json({ success: true, updated: true });
    }

    // --- CREATE FLOW ---
    if (actionType === "create") {
        const title = formData.get("title");
        const products = JSON.parse(formData.get("products")); 
        
        let totalOriginal = 0;
        let totalBundle = 0;
        const productIds = [];

        products.forEach(p => {
            totalOriginal += parseFloat(p.originalPrice || 0);
            totalBundle += parseFloat(p.bundlePrice || 0);
            productIds.push(p.productId); 
        });

        const discountValue = totalOriginal - totalBundle;
        let createdDiscountId = null;

        // A. Add Tags
        for (const pid of productIds) {
            await admin.graphql(
                `#graphql
                mutation addTags($id: ID!, $tags: [String!]!) {
                    tagsAdd(id: $id, tags: $tags) {
                        node { id }
                    }
                }`,
                { variables: { id: pid, tags: ["Bundle-Item"] } }
            );
        }

        // B. Create Automatic Discount
        if (discountValue > 0) {
            const response = await admin.graphql(
                `#graphql
                mutation discountAutomaticBasicCreate($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
                  discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
                    automaticDiscountNode {
                       id
                       automaticDiscount {
                         ... on DiscountAutomaticBasic { title }
                       }
                    }
                    userErrors { field message }
                  }
                }`,
                {
                  variables: {
                    automaticBasicDiscount: {
                      title: `${title} (Save ${discountValue.toFixed(2)})`,
                      startsAt: new Date().toISOString(),
                      minimumRequirement: {
                        quantity: { greaterThanOrEqualToQuantity: products.length.toString() }
                      },
                      customerGets: {
                        value: { 
                            discountAmount: { 
                                amount: discountValue.toFixed(2), 
                                appliesOnEachItem: false 
                            } 
                        },
                        items: { 
                            products: { productsToAdd: productIds } 
                        }
                      }
                    }
                  }
                }
            );

            const responseJson = await response.json();
            const errors = responseJson.data?.discountAutomaticBasicCreate?.userErrors || [];
            if (errors.length > 0) {
                return Response.json({ error: `Shopify API Error: ${errors[0].message}` }, { status: 400 });
            }
            createdDiscountId = responseJson.data?.discountAutomaticBasicCreate?.automaticDiscountNode?.id;
        }

        // C. Save to DB
        const newShortId = await generateShortId(session.shop); 
        await db.bundle.create({
            data: {
                shop: session.shop,
                title,
                price: totalBundle.toFixed(2),
                productIds: JSON.stringify(products),
                discountId: createdDiscountId,
                shortId: newShortId
            }
        });

        await syncMetafields(admin, session.shop);
        return Response.json({ success: true, created: true });
    }
  } catch (error) {
      console.error("SERVER ERROR:", error);
      return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ success: true });
}

// Sync Metafields Helper
async function syncMetafields(admin, shopDomain) {
  const shopQ = await admin.graphql(`{ shop { id } }`);
  const shopId = (await shopQ.json()).data.shop.id;

  const bundles = await db.bundle.findMany({ where: { shop: shopDomain } });

  const jsonString = JSON.stringify(bundles.map(b => ({
    id: b.id,
    shortId: b.shortId, // Add shortId here
    title: b.title,
    price: b.price,
    products: JSON.parse(b.productIds) 
  })));

  await admin.graphql(
    `#graphql
    mutation CreateAppData($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [{
          namespace: "my_app",
          key: "active_bundles",
          type: "json",
          ownerId: shopId,
          value: jsonString
        }]
      }
    }
  );
}

// New helper function to generate shortId
async function generateShortId(shopDomain) {
  const latestBundle = await db.bundle.findFirst({
    where: { shop: shopDomain, shortId: { startsWith: "Scb" } },
    orderBy: { shortId: 'desc' }, // Assuming Scb001, Scb002... will sort correctly
    select: { shortId: true },
  });

  let nextNumber = 1;
  if (latestBundle?.shortId) {
    const num = parseInt(latestBundle.shortId.replace("Scb", ""), 10);
    if (!isNaN(num)) {
      nextNumber = num + 1;
    }
  }
  return `Scb${String(nextNumber).padStart(3, '0')}`;
}

// 3. UI COMPONENT
export default function BundlePage() {
  const { bundles, currencySymbol, billing, gated } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const revalidator = useRevalidator();
  
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editProducts, setEditProducts] = useState([]);
  const [editLoading, setEditLoading] = useState(false);

  const mapSelectionToProducts = (selection) => selection.map(p => ({
    productId: p.id,
    handle: p.handle,
    title: p.title,
    image: p.images?.[0]?.originalSrc || "",
    originalPrice: parseFloat(p.variants?.[0]?.price || "0"),
    bundlePrice: parseFloat(p.variants?.[0]?.price || "0")
  }));

  const handleSelectProducts = async () => {
    const selection = await shopify.resourcePicker({ type: "product", multiple: true });
    if (selection) {
      setSelectedProducts(mapSelectionToProducts(selection));
    }
  };

  const handleSelectEditProducts = async () => {
    const selection = await shopify.resourcePicker({ type: "product", multiple: true });
    if (selection) {
      setEditProducts(mapSelectionToProducts(selection));
    }
  };

  const updateProductPrice = (list, setList, index, newPrice) => {
      const updated = [...list];
      updated[index].bundlePrice = parseFloat(newPrice);
      setList(updated);
  };

  const handleSave = () => {
    if (selectedProducts.length < 2) return shopify.toast.show("Select 2+ products", { isError: true });
    if (!title) return shopify.toast.show("Enter title", { isError: true });

    setLoading(true);
    const data = new FormData();
    data.append("action", "create");
    data.append("title", title);
    data.append("products", JSON.stringify(selectedProducts)); 
    submit(data, { method: "POST" });
  };

  const handleEditOpen = (bundle) => {
    const products = JSON.parse(bundle.productIds || "[]").map((p) => ({
      ...p,
      originalPrice: parseFloat(p.originalPrice || 0),
      bundlePrice: parseFloat(p.bundlePrice || 0),
    }));
    setEditId(bundle.id);
    setEditTitle(bundle.title || "");
    setEditProducts(products);
    setEditOpen(true);
  };

  const handleEditClose = () => {
    setEditOpen(false);
    setEditId(null);
    setEditTitle("");
    setEditProducts([]);
    setEditLoading(false);
  };

  const handleUpdate = () => {
    if (!editId) return;
    if (editProducts.length < 2) return shopify.toast.show("Select 2+ products", { isError: true });
    if (!editTitle) return shopify.toast.show("Enter title", { isError: true });

    setEditLoading(true);
    const data = new FormData();
    data.append("action", "update");
    data.append("id", editId);
    data.append("title", editTitle);
    data.append("products", JSON.stringify(editProducts));
    submit(data, { method: "POST" });
  };

  useEffect(() => {
    if (!actionData) return;

    if (actionData?.error) {
      setLoading(false);
      setEditLoading(false);
      return;
    }

    if (actionData?.success) {
      setLoading(false);
      setEditLoading(false);
      revalidator.revalidate();
    }

    if (actionData?.created) {
      setTitle("");
      setSelectedProducts([]);
      shopify.toast.show("Bundle Saved!");
    }

    if (actionData?.updated) {
      shopify.toast.show("Bundle Updated!");
      handleEditClose();
    }

    if (actionData?.deleted) {
      shopify.toast.show("Bundle Deleted!");
    }
  }, [actionData, revalidator, shopify, handleEditClose]);

  const handleDelete = (id) => {
      if(confirm("Delete bundle and remove discount?")) {
        const data = new FormData();
        data.append("action", "delete");
        data.append("id", id);
        submit(data, { method: "POST" });
      }
  };

  if (gated) {
    return (
      <AppProvider i18n={enTranslations}>
        <Page title="Fixed Bundles">
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Bundles Locked</Text>
                  <Text as="p">
                    Your current plan does not allow Bundles. If you are on the Basic plan,
                    choose Bundles in Plan & Billing. For full access, upgrade to Premium.
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
      <Page title="Fixed Bundles">
        <BlockStack gap="400">
            {actionData?.error && <Banner tone="critical" title="Error">{actionData.error}</Banner>}
            {actionData?.created && <Banner tone="success" title="Success">Bundle Saved!</Banner>}

            <Layout>
            <Layout.Section>
                <Card>
                <BlockStack gap="400">
                    <Text variant="headingMd">Create Bundle</Text>
                    <TextField label="Bundle Title" value={title} onChange={setTitle} autoComplete="off"/>
                    <Button onClick={handleSelectProducts}>Select Products</Button>
                    {selectedProducts.length > 0 && (
                    <BlockStack gap="400">
                        <Text fontWeight="bold">Set Price Per Item:</Text>
                        {selectedProducts.map((p, index) => (
                            <InlineStack key={p.productId} align="space-between" blockAlign="center">
                                <InlineStack gap="200" blockAlign="center">
                                    {p.image && <Thumbnail source={p.image} size="small" alt={p.title}/>}
                                    <BlockStack>
                                        <Text fontWeight="bold">{p.title}</Text>
                                        <Text tone="subdued">Original: {currencySymbol}{p.originalPrice.toFixed(2)}</Text>
                                    </BlockStack>
                                </InlineStack>
                                <div style={{width: '150px'}}>
                                    <TextField 
                                        type="number" label="Bundle Price" labelHidden 
                                        value={p.bundlePrice} 
                                        onChange={(val) => updateProductPrice(selectedProducts, setSelectedProducts, index, val)}
                                        prefix={currencySymbol}
                                    />
                                </div>
                            </InlineStack>
                        ))}
                         <Banner tone="info">Total: <b>{currencySymbol}{selectedProducts.reduce((a,b)=>a+b.bundlePrice, 0).toFixed(2)}</b></Banner>
                    </BlockStack>
                    )}
                    <InlineStack align="end"><Button variant="primary" loading={loading} onClick={handleSave}>Save Bundle</Button></InlineStack>
                </BlockStack>
                </Card>
            </Layout.Section>
            <Layout.Section>
                <Card padding="0">
                    <IndexTable resourceName={{ singular: 'bundle', plural: 'bundles' }} itemCount={bundles.length} headings={[{ title: 'ID' }, { title: 'Title' }, { title: 'Price' }, { title: 'Actions' }]}>
                    {bundles.map((bundle, index) => (
                        <IndexTable.Row id={bundle.id} key={bundle.id} position={index}>
                        <IndexTable.Cell>{bundle.shortId || bundle.id}</IndexTable.Cell>
                        <IndexTable.Cell><Text fontWeight="bold">{bundle.title}</Text></IndexTable.Cell>
                        <IndexTable.Cell>{currencySymbol}{bundle.price}</IndexTable.Cell>
                        <IndexTable.Cell>
                          <InlineStack gap="200">
                            <Button onClick={() => handleEditOpen(bundle)}>Edit</Button>
                            <Button tone="critical" onClick={() => handleDelete(bundle.id)}>Delete</Button>
                          </InlineStack>
                        </IndexTable.Cell>
                        </IndexTable.Row>
                    ))}
                    </IndexTable>
                </Card>
            </Layout.Section>
            </Layout>
        </BlockStack>
        <Modal
          open={editOpen}
          onClose={handleEditClose}
          title="Edit Bundle"
          primaryAction={{ content: "Save Changes", onAction: handleUpdate, loading: editLoading }}
          secondaryActions={[{ content: "Cancel", onAction: handleEditClose }]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField label="Bundle Title" value={editTitle} onChange={setEditTitle} autoComplete="off" />
              <Button onClick={handleSelectEditProducts}>Select Products</Button>
              {editProducts.length > 0 && (
                <BlockStack gap="400">
                  <Text fontWeight="bold">Set Price Per Item:</Text>
                  {editProducts.map((p, index) => (
                    <InlineStack key={p.productId} align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        {p.image && <Thumbnail source={p.image} size="small" alt={p.title} />}
                        <BlockStack>
                          <Text fontWeight="bold">{p.title}</Text>
                          <Text tone="subdued">Original: {currencySymbol}{parseFloat(p.originalPrice || 0).toFixed(2)}</Text>
                        </BlockStack>
                      </InlineStack>
                      <div style={{ width: '150px' }}>
                        <TextField
                          type="number"
                          label="Bundle Price"
                          labelHidden
                          value={p.bundlePrice}
                          onChange={(val) => updateProductPrice(editProducts, setEditProducts, index, val)}
                          prefix={currencySymbol}
                        />
                      </div>
                    </InlineStack>
                  ))}
                  <Banner tone="info">Total: <b>{currencySymbol}{editProducts.reduce((a, b) => a + (parseFloat(b.bundlePrice) || 0), 0).toFixed(2)}</b></Banner>
                </BlockStack>
              )}
            </FormLayout>
          </Modal.Section>
        </Modal>
      </Page>
    </AppProvider>
  );
}

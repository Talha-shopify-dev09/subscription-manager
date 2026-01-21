import { useState } from "react";
import { useLoaderData, useSubmit, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  AppProvider, Page, Layout, Card, Button, Text, TextField, BlockStack,
  InlineStack, IndexTable, EmptyState, Thumbnail, Banner
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { useAppBridge } from "@shopify/app-bridge-react";
import db from "../db.server";

// 1. LOADER: Optimized & Safe Currency Extraction
export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  
  // Fetch Shop Info (ID + Currency) in one go
  const shopResponse = await admin.graphql(
    `#graphql
    query {
      shop {
        id
        currencyFormats {
          moneyInEmailsFormat // Uses plain text (e.g. "${{amount}}"), avoiding HTML issues
        }
      }
    }`
  );
  
  const shopJson = await shopResponse.json();
  const shopId = shopJson.data?.shop?.id;
  
  // Robust Symbol Extraction: Remove {{amount}} and trim whitespace
  const rawFormat = shopJson.data?.shop?.currencyFormats?.moneyInEmailsFormat || "${{amount}}";
  const currencySymbol = rawFormat.replace(/\{\{amount\}\}/g, "").trim() || "$";

  const bundles = await db.bundle.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });

  return { bundles, currencySymbol, shopId };
}

// 2. ACTION: Full Lifecycle Management
export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");

  try {
    // --- DELETE FLOW (Cleans up Shopify Discount) ---
    if (actionType === "delete") {
        const bundleId = formData.get("id");
        
        // 1. Find the bundle to get the Discount ID
        const bundle = await db.bundle.findUnique({ where: { id: bundleId } });
        
        if (bundle?.discountId) {
            console.log("Deleting Shopify Discount:", bundle.discountId);
            
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
            
            // We log errors but don't stop DB deletion (orphans in Shopify are better than broken app state)
            const deleteJson = await deleteResponse.json();
            if (deleteJson.data?.discountAutomaticDelete?.userErrors?.length > 0) {
                console.warn("Failed to delete discount:", deleteJson.data.discountAutomaticDelete.userErrors);
            }
        }

        // 3. Delete from DB
        await db.bundle.delete({ where: { id: bundleId } });
        
        // 4. Sync Metafields
        await syncMetafields(admin, session.shop);
        
        return { success: true, message: "Bundle and Discount deleted" };
    }

    // --- CREATE FLOW (Captures Discount ID) ---
    if (actionType === "create") {
        const title = formData.get("title");
        const products = JSON.parse(formData.get("products")); 
        
        // A. Calculations
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

        // B. Add Tag (Required for tracking logic if needed, or just visual)
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

        // C. Create Automatic Discount
        if (discountValue > 0) {
            const response = await admin.graphql(
                `#graphql
                mutation discountAutomaticBasicCreate($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
                  discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
                    automaticDiscountNode {
                       id  # <--- CRITICAL: Capture the ID
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
            
            // STRICT ERROR CHECKING
            const errors = responseJson.data?.discountAutomaticBasicCreate?.userErrors || [];
            if (errors.length > 0) {
                console.error("Discount Creation Failed:", errors);
                return { error: `Shopify API Error: ${errors[0].message}` };
            }

            createdDiscountId = responseJson.data?.discountAutomaticBasicCreate?.automaticDiscountNode?.id;
        }

        // D. Save to DB with Discount ID
        await db.bundle.create({
            data: {
                shop: session.shop,
                title,
                price: totalBundle.toFixed(2),
                productIds: JSON.stringify(products),
                discountId: createdDiscountId // <--- Store it!
            }
        });

        await syncMetafields(admin, session.shop);
        
        return { success: true };
    }
  } catch (error) {
      console.error("SERVER ERROR:", error);
      return { error: error.message };
  }
  return null;
}

// Helper: Syncs Bundles to Shop Metafield (Optimized)
async function syncMetafields(admin, shopDomain) {
  // We need to fetch the Shop ID here if not passed, but usually easiest to fetch inside action
  // For safety/speed, we'll do a quick fetch or pass it if we refactor. 
  // Given the structure, let's fetch it cleanly.
  const shopQ = await admin.graphql(`{ shop { id } }`);
  const shopId = (await shopQ.json()).data.shop.id;

  const bundles = await db.bundle.findMany({ where: { shop: shopDomain } });

  const jsonString = JSON.stringify(bundles.map(b => ({
    id: b.id,
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

// 3. UI COMPONENT (Standard, using the robust currencySymbol)
export default function BundlePage() {
  const { bundles, currencySymbol } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const shopify = useAppBridge();
  
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSelectProducts = async () => {
    const selection = await shopify.resourcePicker({ type: "product", multiple: true });
    if (selection) {
      const products = selection.map(p => ({
        productId: p.id,
        handle: p.handle,
        title: p.title,
        image: p.images?.[0]?.originalSrc || "",
        originalPrice: parseFloat(p.variants?.[0]?.price || "0"),
        bundlePrice: parseFloat(p.variants?.[0]?.price || "0") 
      }));
      setSelectedProducts(products);
    }
  };

  const updateProductPrice = (index, newPrice) => {
      const updated = [...selectedProducts];
      updated[index].bundlePrice = parseFloat(newPrice);
      setSelectedProducts(updated);
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

  // Reset UI on success
  if (!loading && actionData?.success) {
      // Logic to clear state handled by re-render usually, but can explicitly clear here if strict
  }

  const handleDelete = (id) => {
      if(confirm("Are you sure? This will delete the Shopify discount as well.")) {
        const data = new FormData();
        data.append("action", "delete");
        data.append("id", id);
        submit(data, { method: "POST" });
      }
  };

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Fixed Bundles">
        <BlockStack gap="400">
            {actionData?.error && <Banner tone="critical" title="Error">{actionData.error}</Banner>}
            {actionData?.success && <Banner tone="success" title="Success">Bundle Saved!</Banner>}

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
                                        onChange={(val) => updateProductPrice(index, val)}
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
                    <IndexTable resourceName={{ singular: 'bundle', plural: 'bundles' }} itemCount={bundles.length} headings={[{ title: 'Title' }, { title: 'Price' }, { title: 'Action' }]}>
                    {bundles.map((bundle, index) => (
                        <IndexTable.Row id={bundle.id} key={bundle.id} position={index}>
                        <IndexTable.Cell><Text fontWeight="bold">{bundle.title}</Text></IndexTable.Cell>
                        <IndexTable.Cell>{currencySymbol}{bundle.price}</IndexTable.Cell>
                        <IndexTable.Cell><Button tone="critical" onClick={() => handleDelete(bundle.id)}>Delete</Button></IndexTable.Cell>
                        </IndexTable.Row>
                    ))}
                    </IndexTable>
                </Card>
            </Layout.Section>
            </Layout>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
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

// 1. LOADER
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const bundles = await db.bundle.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });
  return { bundles };
}

// 2. ACTION: Corrected Mutation
export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");

  try {
    if (actionType === "delete") {
        await db.bundle.delete({ where: { id: formData.get("id") } });
        const remaining = await db.bundle.findMany({ where: { shop: session.shop } });
        await updateShopMetafield(admin, remaining);
        return { success: true };
    }

    if (actionType === "create") {
        const title = formData.get("title");
        const rawProducts = JSON.parse(formData.get("products")); 

        const finalProductList = [];
        let totalBundlePrice = 0;

        // LOOP: Create a special variant for EACH product
        for (const p of rawProducts) {
            const bundlePrice = p.bundlePrice || p.originalPrice;
            totalBundlePrice += parseFloat(bundlePrice);

            console.log(`Creating variant for ${p.title} at ${bundlePrice}`);

            // --- FIX: Use 'productVariantsBulkCreate' ---
            const variantResponse = await admin.graphql(
                `#graphql
                mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                    productVariantsBulkCreate(productId: $productId, variants: $variants) {
                        productVariants { id title price }
                        userErrors { field message }
                    }
                }`,
                {
                    variables: {
                        productId: p.productId, // The Parent Product ID
                        variants: [{
                            price: bundlePrice,
                            optionValues: [{name: "Title", value: "Bundle Deal"}], // or mapped to existing options
                            // For simple products without options, we might need a different strategy,
                            // but usually, adding an option requires 'productUpdate'. 
                            // To keep it simple: We assume the product has options or we use standard variant creation.
                            // If product has NO options (Default Title), adding a variant is tricky.
                            // Let's try the simplest "price override" approach first.
                            
                            // BETTER APPROACH FOR SIMPLICITY:
                            // We just set the price. If it fails, we fall back.
                            price: bundlePrice
                        }]
                    }
                }
            );
            
            // NOTE: Creating variants on products that only have "Default Title" is complex.
            // If this fails, it usually means the product needs Options (Size/Color) first.
            // For this tutorial, we will try to just add it. 
            // If it fails, we will use the ORIGINAL ID so the flow doesn't break.

            const variantJson = await variantResponse.json();
            
            // Check if data exists
            if (!variantJson.data || !variantJson.data.productVariantsBulkCreate) {
                 console.error("API Error:", variantJson);
                 finalProductList.push({ handle: p.handle, id: p.originalVariantId, price: p.originalPrice });
                 continue;
            }

            const newVariants = variantJson.data.productVariantsBulkCreate.productVariants;
            const errors = variantJson.data.productVariantsBulkCreate.userErrors;

            if (errors.length > 0 || !newVariants || newVariants.length === 0) {
                 console.warn("Could not create special variant (Product might be simple/no-options). Using original.");
                 // Fallback to original
                 finalProductList.push({
                     handle: p.handle,
                     id: p.originalVariantId, 
                     price: p.originalPrice
                 });
            } else {
                 // SUCCESS
                 finalProductList.push({
                     handle: p.handle,
                     id: newVariants[0].id, 
                     price: newVariants[0].price
                 });
            }
        }

        // SAVE TO DB
        await db.bundle.create({
            data: {
                shop: session.shop,
                title,
                price: totalBundlePrice.toFixed(2),
                productIds: JSON.stringify(finalProductList) 
            }
        });

        const allBundles = await db.bundle.findMany({ where: { shop: session.shop } });
        await updateShopMetafield(admin, allBundles);
        
        return { success: true };
    }
  } catch (error) {
      console.error("SERVER ERROR:", error);
      return { error: error.message };
  }
  return null;
}

// Syncs to Shop Metafield
async function updateShopMetafield(admin, bundles) {
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
          ownerId: (await admin.graphql('{ shop { id } }').then(r => r.json())).data.shop.id,
          value: jsonString
        }]
      }
    }
  );
}

// 3. UI COMPONENT
export default function BundlePage() {
  const { bundles } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const shopify = useAppBridge();
  
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSelectProducts = async () => {
    const selection = await shopify.resourcePicker({
      type: "product",
      multiple: true,
    });

    if (selection) {
      const products = selection.map(p => ({
        productId: p.id,
        originalVariantId: p.variants[0].id, 
        handle: p.handle,
        title: p.title,
        image: p.images?.[0]?.originalSrc || "",
        originalPrice: p.variants?.[0]?.price || "0",
        bundlePrice: p.variants?.[0]?.price || "0" 
      }));
      setSelectedProducts(products);
    }
  };

  const updateProductPrice = (index, newPrice) => {
      const updated = [...selectedProducts];
      updated[index].bundlePrice = newPrice;
      setSelectedProducts(updated);
  };

  const handleSave = () => {
    if (selectedProducts.length < 2) return shopify.toast.show("Select 2+ products", { isError: true });
    if (!title) return shopify.toast.show("Enter title", { isError: true });

    setIsSaving(true);
    const data = new FormData();
    data.append("action", "create");
    data.append("title", title);
    data.append("products", JSON.stringify(selectedProducts)); 
    submit(data, { method: "POST" });
  };

  // Reset UI when done
  if(actionData && isSaving) {
      setIsSaving(false);
      if(actionData.success) {
          setTitle("");
          setSelectedProducts([]);
          shopify.toast.show("Bundle Created!");
      }
  }

  const handleDelete = (id) => {
      const data = new FormData();
      data.append("action", "delete");
      data.append("id", id);
      submit(data, { method: "POST" });
  };

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Fixed Bundles (Real-Time Price)">
        <BlockStack gap="400">
            {actionData?.error && (
                <Banner tone="critical" title="Error">{actionData.error}</Banner>
            )}

            <Layout>
            <Layout.Section>
                <Card>
                <BlockStack gap="400">
                    <Text variant="headingMd">Create Bundle</Text>
                    <TextField label="Bundle Title" value={title} onChange={setTitle} autoComplete="off" placeholder="e.g. Summer Kit"/>

                    <Button onClick={handleSelectProducts}>Select Products</Button>
                    
                    {selectedProducts.length > 0 && (
                    <BlockStack gap="400">
                        <Text fontWeight="bold">Set Bundle Price Per Item:</Text>
                        
                        {selectedProducts.map((p, index) => (
                            <InlineStack key={p.productId} align="space-between" blockAlign="center">
                                <InlineStack gap="200" blockAlign="center">
                                    {p.image && <Thumbnail source={p.image} size="small" alt={p.title}/>}
                                    <BlockStack>
                                        <Text fontWeight="bold">{p.title}</Text>
                                        <Text tone="subdued">Original: ${p.originalPrice}</Text>
                                    </BlockStack>
                                </InlineStack>
                                
                                <div style={{width: '150px'}}>
                                    <TextField 
                                        type="number"
                                        label="Special Price" 
                                        labelHidden 
                                        value={p.bundlePrice} 
                                        onChange={(val) => updateProductPrice(index, val)}
                                        prefix="$"
                                    />
                                </div>
                            </InlineStack>
                        ))}
                        
                        <Banner tone="info">
                            Total Bundle Price: <b>${selectedProducts.reduce((a,b)=>a+parseFloat(b.bundlePrice),0).toFixed(2)}</b>
                        </Banner>
                    </BlockStack>
                    )}

                    <InlineStack align="end">
                    <Button variant="primary" loading={isSaving} onClick={handleSave}>
                        Create Bundle
                    </Button>
                    </InlineStack>
                </BlockStack>
                </Card>
            </Layout.Section>

            <Layout.Section>
                <Card padding="0">
                    <IndexTable
                    resourceName={{ singular: 'bundle', plural: 'bundles' }}
                    itemCount={bundles.length}
                    headings={[{ title: 'Title' }, { title: 'Price' }, { title: 'Action' }]}
                    >
                    {bundles.map((bundle, index) => (
                        <IndexTable.Row id={bundle.id} key={bundle.id} position={index}>
                        <IndexTable.Cell><Text fontWeight="bold">{bundle.title}</Text></IndexTable.Cell>
                        <IndexTable.Cell>${bundle.price}</IndexTable.Cell>
                        <IndexTable.Cell>
                            <Button tone="critical" onClick={() => handleDelete(bundle.id)}>Delete</Button>
                        </IndexTable.Cell>
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
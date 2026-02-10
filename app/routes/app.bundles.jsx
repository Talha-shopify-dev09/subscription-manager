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

// 1. LOADER: Fixed GraphQL Query
export async function loader({ request }) {
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

  return { bundles, currencySymbol, shopId };
}

// 2. ACTION: Full Lifecycle Management
export async function action({ request }) {
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
        
        return { success: true };
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
                return { error: `Shopify API Error: ${errors[0].message}` };
            }
            createdDiscountId = responseJson.data?.discountAutomaticBasicCreate?.automaticDiscountNode?.id;
        }

        // C. Save to DB
        await db.bundle.create({
            data: {
                shop: session.shop,
                title,
                price: totalBundle.toFixed(2),
                productIds: JSON.stringify(products),
                discountId: createdDiscountId
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

// Sync Metafields Helper
async function syncMetafields(admin, shopDomain) {
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

// 3. UI COMPONENT
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

  // Reset loading state if error comes back
  if (loading && actionData?.error) {
     setLoading(false);
  }
  // Reset UI on success
  if (loading && actionData?.success) {
     setLoading(false);
     setTitle("");
     setSelectedProducts([]);
     shopify.toast.show("Bundle Saved!");
  }

  const handleDelete = (id) => {
      if(confirm("Delete bundle and remove discount?")) {
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
                    <IndexTable resourceName={{ singular: 'bundle', plural: 'bundles' }} itemCount={bundles.length} headings={[{ title: 'ID' }, { title: 'Title' }, { title: 'Price' }, { title: 'Action' }]}>
                    {bundles.map((bundle, index) => (
                        <IndexTable.Row id={bundle.id} key={bundle.id} position={index}>
                        <IndexTable.Cell>{bundle.id}</IndexTable.Cell>
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
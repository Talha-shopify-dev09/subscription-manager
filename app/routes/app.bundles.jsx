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

// 1. LOADER (FIXED)
export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  
  // FIX: Use 'moneyFormat' instead of the invalid 'active' field
  const shopResponse = await admin.graphql(
    `#graphql
    query {
      shop {
        currencyFormats {
          moneyFormat
        }
      }
    }`
  );
  
  const shopJson = await shopResponse.json();
  const moneyFormat = shopJson.data?.shop?.currencyFormats?.moneyFormat || "$ {{amount}}";
  
  // Extract symbol (Remove {{amount}} and whitespace)
  const currencySymbol = moneyFormat.replace("{{amount}}", "").trim();

  const bundles = await db.bundle.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });

  return { bundles, currencySymbol };
}

// 2. ACTION
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

        // A. TAGGING
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

        // B. AUTOMATIC DISCOUNT
        if (discountValue > 0) {
            await admin.graphql(
                `#graphql
                mutation discountAutomaticBasicCreate($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
                  discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
                    userErrors { field message }
                  }
                }`,
                {
                  variables: {
                    automaticBasicDiscount: {
                      title: `${title} (Save ${discountValue.toFixed(0)})`,
                      startsAt: new Date().toISOString(),
                      minimumRequirement: {
                        quantity: { greaterThanOrEqualToQuantity: products.length.toString() }
                      },
                      customerGets: {
                        value: { discountAmount: { amount: discountValue.toFixed(2), appliesOnEachItem: false } },
                        items: { products: { productsToAdd: productIds } }
                      }
                    }
                  }
                }
            );
        }

        // C. SAVE BUNDLE
        await db.bundle.create({
            data: {
                shop: session.shop,
                title,
                price: totalBundle.toFixed(2),
                productIds: JSON.stringify(products) 
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
  const { bundles, currencySymbol } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const shopify = useAppBridge();
  
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [title, setTitle] = useState("");

  const handleSelectProducts = async () => {
    const selection = await shopify.resourcePicker({ type: "product", multiple: true });
    if (selection) {
      const products = selection.map(p => ({
        productId: p.id,
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
    const data = new FormData();
    data.append("action", "create");
    data.append("title", title);
    data.append("products", JSON.stringify(selectedProducts)); 
    submit(data, { method: "POST" });
    setTitle("");
    setSelectedProducts([]);
  };

  const handleDelete = (id) => {
      const data = new FormData();
      data.append("action", "delete");
      data.append("id", id);
      submit(data, { method: "POST" });
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
                                    <BlockStack><Text fontWeight="bold">{p.title}</Text><Text tone="subdued">Original: {currencySymbol}{p.originalPrice}</Text></BlockStack>
                                </InlineStack>
                                <div style={{width: '150px'}}><TextField type="number" label="Bundle Price" labelHidden value={p.bundlePrice} onChange={(val) => updateProductPrice(index, val)} prefix={currencySymbol}/></div>
                            </InlineStack>
                        ))}
                         <Banner tone="info">Total: <b>{currencySymbol}{selectedProducts.reduce((a,b)=>a+parseFloat(b.bundlePrice),0).toFixed(2)}</b></Banner>
                    </BlockStack>
                    )}
                    <InlineStack align="end"><Button variant="primary" onClick={handleSave}>Save Bundle</Button></InlineStack>
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
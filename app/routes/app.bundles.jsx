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

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const bundles = await db.bundle.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });
  return { bundles };
}

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

        // 1. Calculate Totals
        let totalOriginal = 0;
        let totalBundlePrice = 0;

        products.forEach(p => {
            totalOriginal += parseFloat(p.originalPrice || 0);
            totalBundlePrice += parseFloat(p.bundlePrice || 0);
        });

        const discountAmount = totalOriginal - totalBundlePrice;
        let generatedCode = null;

        // 2. Create Automatic Discount Code
        if (discountAmount > 0) {
            const code = `BUNDLE-${Date.now()}`; // Unique Code
            
            const response = await admin.graphql(
                `#graphql
                mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
                  discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
                    codeDiscountNode {
                      codeDiscount {
                        ... on DiscountCodeBasic { codes(first: 1) { nodes { code } } }
                      }
                    }
                  }
                }`,
                {
                  variables: {
                    basicCodeDiscount: {
                      title: `Bundle: ${title}`,
                      code: code,
                      startsAt: new Date().toISOString(),
                      customerSelection: { all: true },
                      customerGets: {
                        value: { discountAmount: { amount: discountAmount.toFixed(2), appliesOnEachItem: false } },
                        items: { all: true }
                      }
                    }
                  }
                }
            );
            
            const responseJson = await response.json();
            if(responseJson.data?.discountCodeBasicCreate?.codeDiscountNode) {
                generatedCode = code;
            }
        }

        // 3. Save Bundle
        await db.bundle.create({
            data: {
                shop: session.shop,
                title,
                price: totalBundlePrice.toFixed(2),
                discountCode: generatedCode,
                // We save just the Handle/ID. We DON'T save specific variant IDs here, 
                // so the frontend can choose ANY variant.
                productIds: JSON.stringify(products) 
            }
        });

        const allBundles = await db.bundle.findMany({ where: { shop: session.shop } });
        await updateShopMetafield(admin, allBundles);
        
        return { success: true };
    }
  } catch (error) {
      console.error("SERVER ERROR:", error);
      return { error: "System Error: " + error.message };
  }
  return null;
}

async function updateShopMetafield(admin, bundles) {
  const jsonString = JSON.stringify(bundles.map(b => ({
    id: b.id,
    title: b.title,
    price: b.price,
    discount_code: b.discountCode,
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

export default function BundlePage() {
  const { bundles } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const shopify = useAppBridge();
  
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [title, setTitle] = useState("");

  const handleSelectProducts = async () => {
    const selection = await shopify.resourcePicker({
      type: "product", // Select Whole Product
      multiple: true,
    });

    if (selection) {
      const products = selection.map(p => ({
        id: p.id,
        handle: p.handle, // Critical for Liquid
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
                            <InlineStack key={p.id} align="space-between" blockAlign="center">
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
                                        label="Price" labelHidden 
                                        value={p.bundlePrice} 
                                        onChange={(val) => updateProductPrice(index, val)}
                                        prefix="$"
                                    />
                                </div>
                            </InlineStack>
                        ))}
                        <Banner tone="info">
                            Bundle Total: <b>${selectedProducts.reduce((a,b)=>a+parseFloat(b.bundlePrice),0).toFixed(2)}</b>
                        </Banner>
                    </BlockStack>
                    )}
                    <InlineStack align="end"><Button variant="primary" onClick={handleSave}>Save Bundle</Button></InlineStack>
                </BlockStack>
                </Card>
            </Layout.Section>
            <Layout.Section>
                <Card padding="0">
                    <IndexTable
                    resourceName={{ singular: 'bundle', plural: 'bundles' }}
                    itemCount={bundles.length}
                    headings={[{ title: 'Title' }, { title: 'Total Price' }, { title: 'Action' }]}
                    >
                    {bundles.map((bundle, index) => (
                        <IndexTable.Row id={bundle.id} key={bundle.id} position={index}>
                        <IndexTable.Cell><Text fontWeight="bold">{bundle.title}</Text></IndexTable.Cell>
                        <IndexTable.Cell>${bundle.price}</IndexTable.Cell>
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
import { useState } from "react";
import { useLoaderData, useSubmit } from "react-router";
import { authenticate } from "../shopify.server";
import {
  AppProvider, 
  Page, 
  Layout, 
  Card, 
  Button, 
  Text, 
  TextField, 
  BlockStack,
  InlineStack, 
  IndexTable, 
  EmptyState, 
  Thumbnail, 
  Badge // <--- ADDED THIS IMPORT
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

// 2. ACTION: Creates Discount Automatically!
export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "delete") {
    const bundle = await db.bundle.findUnique({ where: { id: formData.get("id") } });
    await db.bundle.delete({ where: { id: formData.get("id") } });
    
    // Sync Metafields
    const remaining = await db.bundle.findMany({ where: { shop: session.shop } });
    await updateShopMetafield(admin, remaining);
    return { success: true };
  }

  if (actionType === "create") {
    const title = formData.get("title");
    const priceStr = formData.get("price");
    const products = JSON.parse(formData.get("products")); 

    // A. Calculate Discount
    let totalOriginalPrice = 0.0;
    products.forEach(p => {
        totalOriginalPrice += parseFloat(p.price || "0");
    });

    const targetPrice = parseFloat(priceStr);
    const discountAmount = totalOriginalPrice - targetPrice;
    
    let generatedCode = null;

    // Only create discount if bundle is cheaper than total
    if (discountAmount > 0) {
        const code = `BUNDLE-${Date.now()}`;
        
        // B. Create Discount via GraphQL
        const response = await admin.graphql(
            `#graphql
            mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
              discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
                codeDiscountNode {
                  codeDiscount {
                    ... on DiscountCodeBasic {
                      title
                      codes(first: 1) { nodes { code } }
                    }
                  }
                }
                userErrors { field message }
              }
            }`,
            {
              variables: {
                basicCodeDiscount: {
                  title: `Bundle: ${title}`,
                  code: code,
                  startsAt: new Date().toISOString(),
                  usageLimit: null,
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
        } else {
            console.error("Discount Error:", responseJson.data?.discountCodeBasicCreate?.userErrors);
        }
    }

    // C. Save Bundle with Code
    await db.bundle.create({
      data: {
        shop: session.shop,
        title,
        price: priceStr,
        discountCode: generatedCode, 
        productIds: JSON.stringify(products) 
      }
    });

    const allBundles = await db.bundle.findMany({ where: { shop: session.shop } });
    await updateShopMetafield(admin, allBundles);
    return { success: true };
  }
  return null;
}

// Syncs to Shop Metafield
async function updateShopMetafield(admin, bundles) {
  const jsonString = JSON.stringify(bundles.map(b => ({
    id: b.id,
    title: b.title,
    price: b.price,
    discount_code: b.discountCode, 
    products: JSON.parse(b.productIds).map(p => ({
        handle: p.handle,
        id: p.id
    }))
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
  const submit = useSubmit();
  const shopify = useAppBridge();
  
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");

  const handleSelectProducts = async () => {
    const selection = await shopify.resourcePicker({
      type: "product",
      multiple: true,
    });

    if (selection) {
      const products = selection.map(p => ({
        id: p.id,
        handle: p.handle,
        title: p.title,
        image: p.images?.[0]?.originalSrc || "",
        price: p.variants?.[0]?.price || "0" 
      }));
      setSelectedProducts(products);
    }
  };

  const handleSave = () => {
    if (selectedProducts.length < 2) return shopify.toast.show("Select 2+ products", { isError: true });
    if (!title) return shopify.toast.show("Enter title", { isError: true });

    const data = new FormData();
    data.append("action", "create");
    data.append("title", title);
    data.append("price", price);
    data.append("products", JSON.stringify(selectedProducts));
    
    submit(data, { method: "POST" });
    
    setTitle("");
    setPrice("");
    setSelectedProducts([]);
    shopify.toast.show("Bundle & Discount Created!");
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
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Create Product Bundle</Text>
                <TextField label="Bundle Title" value={title} onChange={setTitle} autoComplete="off" placeholder="e.g. Snowboard Kit"/>
                <TextField label="Bundle Fixed Price" value={price} onChange={setPrice} autoComplete="off" prefix="$" helpText="We will auto-create a discount to match this price."/>

                <Button onClick={handleSelectProducts}>Select Products</Button>
                
                {selectedProducts.length > 0 && (
                  <BlockStack gap="200">
                    <Text fontWeight="bold">Selected Items:</Text>
                    <InlineStack gap="300">
                      {selectedProducts.map(p => (
                         <div key={p.id} style={{display:'flex', alignItems:'center', gap:'5px', border:'1px solid #ddd', padding:'5px', borderRadius:'5px'}}>
                            {p.image && <Thumbnail source={p.image} size="small" alt={p.title}/>}
                            <Text>{p.title} (${p.price})</Text>
                         </div>
                      ))}
                    </InlineStack>
                    <Text tone="subdued">Estimated Total: ${selectedProducts.reduce((a,b)=>a+parseFloat(b.price),0).toFixed(2)}</Text>
                  </BlockStack>
                )}

                <InlineStack align="end">
                  <Button variant="primary" onClick={handleSave}>Save & Auto-Create Discount</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card padding="0">
              {bundles.length === 0 ? (
                 <EmptyState heading="No bundles found" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png">
                   <p>Create a bundle to display it on your store.</p>
                 </EmptyState>
              ) : (
                <IndexTable
                  resourceName={{ singular: 'bundle', plural: 'bundles' }}
                  itemCount={bundles.length}
                  headings={[{ title: 'Title' }, { title: 'Price' }, { title: 'Discount Code' }, { title: 'Action' }]}
                >
                  {bundles.map((bundle, index) => (
                    <IndexTable.Row id={bundle.id} key={bundle.id} position={index}>
                      <IndexTable.Cell><Text fontWeight="bold">{bundle.title}</Text></IndexTable.Cell>
                      <IndexTable.Cell>{bundle.price ? `$${bundle.price}` : 'N/A'}</IndexTable.Cell>
                      <IndexTable.Cell><Badge tone="success">{bundle.discountCode || "None"}</Badge></IndexTable.Cell>
                      <IndexTable.Cell>
                        <Button tone="critical" onClick={() => handleDelete(bundle.id)}>Delete</Button>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}
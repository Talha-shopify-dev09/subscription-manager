import { useState } from "react";
import { useLoaderData, useSubmit } from "react-router";
import { authenticate } from "../shopify.server";
import {
  AppProvider, // <--- ADDED
  Page, Layout, Card, Button, Text, TextField, BlockStack,
  InlineStack, IndexTable, EmptyState, Badge
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json"; // <--- ADDED
import { useAppBridge } from "@shopify/app-bridge-react";
import db from "../db.server";

// 1. LOADER: Get existing bundles
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const bundles = await db.bundle.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });
  return { bundles };
}

// 2. ACTION: Save or Delete Bundle
export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "delete") {
    await db.bundle.delete({ where: { id: formData.get("id") } });
    
    // Update Metafields (Sync deletion)
    const remaining = await db.bundle.findMany({ where: { shop: session.shop } });
    await updateShopMetafield(admin, remaining);
    
    return { success: true };
  }

  if (actionType === "create") {
    const title = formData.get("title");
    const price = formData.get("price");
    const products = JSON.parse(formData.get("products"));
    const productIds = products.map(p => p.id); 

    await db.bundle.create({
      data: {
        shop: session.shop,
        title,
        price,
        productIds: JSON.stringify(productIds)
      }
    });

    // Update Metafields
    const allBundles = await db.bundle.findMany({ where: { shop: session.shop } });
    await updateShopMetafield(admin, allBundles);

    return { success: true };
  }

  return null;
}

// Helper: Syncs Bundles to a Shop Metafield
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
      setSelectedProducts(selection);
    }
  };

  const handleSave = () => {
    if (selectedProducts.length < 2) return shopify.toast.show("Select at least 2 products", { isError: true });
    if (!title) return shopify.toast.show("Enter a bundle title", { isError: true });

    const data = new FormData();
    data.append("action", "create");
    data.append("title", title);
    data.append("price", price);
    data.append("products", JSON.stringify(selectedProducts));
    
    submit(data, { method: "POST" });
    
    // Reset Form
    setTitle("");
    setPrice("");
    setSelectedProducts([]);
    shopify.toast.show("Bundle Saved!");
  };

  const handleDelete = (id) => {
    if(true) { // Simple confirm
       const data = new FormData();
       data.append("action", "delete");
       data.append("id", id);
       submit(data, { method: "POST" });
    }
  };

  return (
    /* --- FIX: Wrapped in AppProvider --- */
    <AppProvider i18n={enTranslations}>
      <Page title="Fixed Bundles">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Create New Bundle</Text>
                
                <TextField label="Bundle Title" value={title} onChange={setTitle} autoComplete="off" placeholder="e.g. Summer Essentials Kit"/>
                <TextField label="Bundle Price (Optional)" value={price} onChange={setPrice} autoComplete="off" prefix="$" helpText="Leave empty to use sum of product prices"/>

                <Button onClick={handleSelectProducts}>Select Products for Bundle</Button>
                
                {selectedProducts.length > 0 && (
                  <BlockStack gap="200">
                    <Text fontWeight="bold">Selected ({selectedProducts.length}):</Text>
                    <InlineStack gap="200">
                      {selectedProducts.map(p => (
                         <Badge key={p.id} tone="info">{p.title}</Badge>
                      ))}
                    </InlineStack>
                  </BlockStack>
                )}

                <InlineStack align="end">
                  <Button variant="primary" onClick={handleSave}>Save Bundle</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card padding="0">
              {bundles.length === 0 ? (
                 <EmptyState heading="No bundles yet" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png">
                   <p>Create a bundle to display it on your store.</p>
                 </EmptyState>
              ) : (
                <IndexTable
                  resourceName={{ singular: 'bundle', plural: 'bundles' }}
                  itemCount={bundles.length}
                  headings={[{ title: 'Title' }, { title: 'Products' }, { title: 'Price' }, { title: 'Action' }]}
                >
                  {bundles.map((bundle, index) => (
                    <IndexTable.Row id={bundle.id} key={bundle.id} position={index}>
                      <IndexTable.Cell><Text fontWeight="bold">{bundle.title}</Text></IndexTable.Cell>
                      <IndexTable.Cell>{JSON.parse(bundle.productIds).length} items</IndexTable.Cell>
                      <IndexTable.Cell>{bundle.price ? `$${bundle.price}` : 'Calculated'}</IndexTable.Cell>
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
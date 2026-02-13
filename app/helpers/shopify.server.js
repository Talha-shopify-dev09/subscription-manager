import { authenticate } from "../shopify.server";

/**
 * Fetches product details from the Shopify Admin API.
 * @param {Request} request - The Remix request object.
 * @param {string} productId - The Shopify Product GID (e.g., "gid://shopify/Product/12345").
 * @returns {Promise<{title: string, imageUrl: string, productUrl: string} | null>} - Product details or null if not found.
 */
export async function getProductDetails(request, productId) {
  try {
    const { admin } = await authenticate.admin(request);

    const query = `
      query GetProductDetails($id: ID!) {
        product(id: $id) {
          title
          onlineStoreUrl
          featuredMedia {
            mediaContentType
            alt
            preview {
              image {
                url
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query, {
      variables: {
        id: productId,
      },
    });

    const responseJson = await response.json();

    if (responseJson.errors && responseJson.errors.length > 0) {
      console.error("GraphQL Product Details Error:", responseJson.errors);
      return null;
    }

    const product = responseJson.data?.product;

    if (product) {
      const imageUrl = product.featuredMedia?.preview?.image?.url || null;
      return {
        title: product.title,
        imageUrl: imageUrl,
        productUrl: product.onlineStoreUrl,
      };
    }

    return null;
  } catch (error) {
    console.error("Error fetching product details:", error);
    return null;
  }
}

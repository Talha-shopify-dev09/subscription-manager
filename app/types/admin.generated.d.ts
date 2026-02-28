/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types.d.ts';

export type BillingInfoQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type BillingInfoQuery = { shop: { plan: Pick<AdminTypes.ShopPlan, 'displayName' | 'partnerDevelopment'> }, currentAppInstallation: { activeSubscriptions: Array<Pick<AdminTypes.AppSubscription, 'name' | 'status' | 'test'>> } };

export type BundlesShopInfoQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type BundlesShopInfoQuery = { shop: (
    Pick<AdminTypes.Shop, 'id'>
    & { currencyFormats: Pick<AdminTypes.CurrencyFormats, 'moneyInEmailsFormat'> }
  ) };

export type DiscountAutomaticDeleteMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type DiscountAutomaticDeleteMutation = { discountAutomaticDelete?: AdminTypes.Maybe<{ userErrors: Array<Pick<AdminTypes.DiscountUserError, 'field' | 'message'>> }> };

export type AddTagsMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  tags: Array<AdminTypes.Scalars['String']['input']> | AdminTypes.Scalars['String']['input'];
}>;


export type AddTagsMutation = { tagsAdd?: AdminTypes.Maybe<{ node?: AdminTypes.Maybe<Pick<AdminTypes.AbandonedCheckout, 'id'> | Pick<AdminTypes.AbandonedCheckoutLineItem, 'id'> | Pick<AdminTypes.Abandonment, 'id'> | Pick<AdminTypes.AddAllProductsOperation, 'id'> | Pick<AdminTypes.AdditionalFee, 'id'> | Pick<AdminTypes.App, 'id'> | Pick<AdminTypes.AppCatalog, 'id'> | Pick<AdminTypes.AppCredit, 'id'> | Pick<AdminTypes.AppInstallation, 'id'> | Pick<AdminTypes.AppPurchaseOneTime, 'id'> | Pick<AdminTypes.AppRevenueAttributionRecord, 'id'> | Pick<AdminTypes.AppSubscription, 'id'> | Pick<AdminTypes.AppUsageRecord, 'id'> | Pick<AdminTypes.Article, 'id'> | Pick<AdminTypes.BasicEvent, 'id'> | Pick<AdminTypes.Blog, 'id'> | Pick<AdminTypes.BulkOperation, 'id'> | Pick<AdminTypes.BusinessEntity, 'id'> | Pick<AdminTypes.CalculatedOrder, 'id'> | Pick<AdminTypes.CartTransform, 'id'> | Pick<AdminTypes.CashTrackingAdjustment, 'id'> | Pick<AdminTypes.CashTrackingSession, 'id'> | Pick<AdminTypes.CatalogCsvOperation, 'id'> | Pick<AdminTypes.Channel, 'id'> | Pick<AdminTypes.ChannelDefinition, 'id'> | Pick<AdminTypes.ChannelInformation, 'id'> | Pick<AdminTypes.CheckoutProfile, 'id'> | Pick<AdminTypes.Collection, 'id'> | Pick<AdminTypes.Comment, 'id'> | Pick<AdminTypes.CommentEvent, 'id'> | Pick<AdminTypes.Company, 'id'> | Pick<AdminTypes.CompanyAddress, 'id'> | Pick<AdminTypes.CompanyContact, 'id'> | Pick<AdminTypes.CompanyContactRole, 'id'> | Pick<AdminTypes.CompanyContactRoleAssignment, 'id'> | Pick<AdminTypes.CompanyLocation, 'id'> | Pick<AdminTypes.CompanyLocationCatalog, 'id'> | Pick<AdminTypes.CompanyLocationStaffMemberAssignment, 'id'> | Pick<AdminTypes.ConsentPolicy, 'id'> | Pick<AdminTypes.CurrencyExchangeAdjustment, 'id'> | Pick<AdminTypes.Customer, 'id'> | Pick<AdminTypes.CustomerAccountAppExtensionPage, 'id'> | Pick<AdminTypes.CustomerAccountNativePage, 'id'> | Pick<AdminTypes.CustomerPaymentMethod, 'id'> | Pick<AdminTypes.CustomerSegmentMembersQuery, 'id'> | Pick<AdminTypes.CustomerVisit, 'id'> | Pick<AdminTypes.DeliveryCarrierService, 'id'> | Pick<AdminTypes.DeliveryCondition, 'id'> | Pick<AdminTypes.DeliveryCountry, 'id'> | Pick<AdminTypes.DeliveryCustomization, 'id'> | Pick<AdminTypes.DeliveryLocationGroup, 'id'> | Pick<AdminTypes.DeliveryMethod, 'id'> | Pick<AdminTypes.DeliveryMethodDefinition, 'id'> | Pick<AdminTypes.DeliveryParticipant, 'id'> | Pick<AdminTypes.DeliveryProfile, 'id'> | Pick<AdminTypes.DeliveryProfileItem, 'id'> | Pick<AdminTypes.DeliveryPromiseParticipant, 'id'> | Pick<AdminTypes.DeliveryPromiseProvider, 'id'> | Pick<AdminTypes.DeliveryProvince, 'id'> | Pick<AdminTypes.DeliveryRateDefinition, 'id'> | Pick<AdminTypes.DeliveryZone, 'id'> | Pick<AdminTypes.DiscountAutomaticBxgy, 'id'> | Pick<AdminTypes.DiscountAutomaticNode, 'id'> | Pick<AdminTypes.DiscountCodeNode, 'id'> | Pick<AdminTypes.DiscountNode, 'id'> | Pick<AdminTypes.DiscountRedeemCodeBulkCreation, 'id'> | Pick<AdminTypes.Domain, 'id'> | Pick<AdminTypes.DraftOrder, 'id'> | Pick<AdminTypes.DraftOrderLineItem, 'id'> | Pick<AdminTypes.DraftOrderTag, 'id'> | Pick<AdminTypes.Duty, 'id'> | Pick<AdminTypes.ExchangeLineItem, 'id'> | Pick<AdminTypes.ExchangeV2, 'id'> | Pick<AdminTypes.ExternalVideo, 'id'> | Pick<AdminTypes.Fulfillment, 'id'> | Pick<AdminTypes.FulfillmentConstraintRule, 'id'> | Pick<AdminTypes.FulfillmentEvent, 'id'> | Pick<AdminTypes.FulfillmentHold, 'id'> | Pick<AdminTypes.FulfillmentLineItem, 'id'> | Pick<AdminTypes.FulfillmentOrder, 'id'> | Pick<AdminTypes.FulfillmentOrderDestination, 'id'> | Pick<AdminTypes.FulfillmentOrderLineItem, 'id'> | Pick<AdminTypes.FulfillmentOrderMerchantRequest, 'id'> | Pick<AdminTypes.GenericFile, 'id'> | Pick<AdminTypes.GiftCard, 'id'> | Pick<AdminTypes.GiftCardCreditTransaction, 'id'> | Pick<AdminTypes.GiftCardDebitTransaction, 'id'> | Pick<AdminTypes.InventoryAdjustmentGroup, 'id'> | Pick<AdminTypes.InventoryItem, 'id'> | Pick<AdminTypes.InventoryItemMeasurement, 'id'> | Pick<AdminTypes.InventoryLevel, 'id'> | Pick<AdminTypes.InventoryQuantity, 'id'> | Pick<AdminTypes.InventoryShipment, 'id'> | Pick<AdminTypes.InventoryShipmentLineItem, 'id'> | Pick<AdminTypes.InventoryTransfer, 'id'> | Pick<AdminTypes.InventoryTransferLineItem, 'id'> | Pick<AdminTypes.LineItem, 'id'> | Pick<AdminTypes.LineItemGroup, 'id'> | Pick<AdminTypes.Location, 'id'> | Pick<AdminTypes.MailingAddress, 'id'> | Pick<AdminTypes.Market, 'id'> | Pick<AdminTypes.MarketCatalog, 'id'> | Pick<AdminTypes.MarketRegionCountry, 'id'> | Pick<AdminTypes.MarketWebPresence, 'id'> | Pick<AdminTypes.MarketingActivity, 'id'> | Pick<AdminTypes.MarketingEvent, 'id'> | Pick<AdminTypes.MediaImage, 'id'> | Pick<AdminTypes.Menu, 'id'> | Pick<AdminTypes.Metafield, 'id'> | Pick<AdminTypes.MetafieldDefinition, 'id'> | Pick<AdminTypes.Metaobject, 'id'> | Pick<AdminTypes.MetaobjectDefinition, 'id'> | Pick<AdminTypes.Model3d, 'id'> | Pick<AdminTypes.OnlineStoreTheme, 'id'> | Pick<AdminTypes.Order, 'id'> | Pick<AdminTypes.OrderAdjustment, 'id'> | Pick<AdminTypes.OrderDisputeSummary, 'id'> | Pick<AdminTypes.OrderEditSession, 'id'> | Pick<AdminTypes.OrderTransaction, 'id'> | Pick<AdminTypes.Page, 'id'> | Pick<AdminTypes.PaymentCustomization, 'id'> | Pick<AdminTypes.PaymentMandate, 'id'> | Pick<AdminTypes.PaymentSchedule, 'id'> | Pick<AdminTypes.PaymentTerms, 'id'> | Pick<AdminTypes.PaymentTermsTemplate, 'id'> | Pick<AdminTypes.PointOfSaleDevice, 'id'> | Pick<AdminTypes.PriceList, 'id'> | Pick<AdminTypes.PriceRule, 'id'> | Pick<AdminTypes.PriceRuleDiscountCode, 'id'> | Pick<AdminTypes.Product, 'id'> | Pick<AdminTypes.ProductBundleOperation, 'id'> | Pick<AdminTypes.ProductDeleteOperation, 'id'> | Pick<AdminTypes.ProductDuplicateOperation, 'id'> | Pick<AdminTypes.ProductFeed, 'id'> | Pick<AdminTypes.ProductOption, 'id'> | Pick<AdminTypes.ProductOptionValue, 'id'> | Pick<AdminTypes.ProductSetOperation, 'id'> | Pick<AdminTypes.ProductTaxonomyNode, 'id'> | Pick<AdminTypes.ProductVariant, 'id'> | Pick<AdminTypes.ProductVariantComponent, 'id'> | Pick<AdminTypes.Publication, 'id'> | Pick<AdminTypes.PublicationResourceOperation, 'id'> | Pick<AdminTypes.QuantityPriceBreak, 'id'> | Pick<AdminTypes.Refund, 'id'> | Pick<AdminTypes.RefundShippingLine, 'id'> | Pick<AdminTypes.Return, 'id'> | Pick<AdminTypes.ReturnLineItem, 'id'> | Pick<AdminTypes.ReturnableFulfillment, 'id'> | Pick<AdminTypes.ReverseDelivery, 'id'> | Pick<AdminTypes.ReverseDeliveryLineItem, 'id'> | Pick<AdminTypes.ReverseFulfillmentOrder, 'id'> | Pick<AdminTypes.ReverseFulfillmentOrderDisposition, 'id'> | Pick<AdminTypes.ReverseFulfillmentOrderLineItem, 'id'> | Pick<AdminTypes.SaleAdditionalFee, 'id'> | Pick<AdminTypes.SavedSearch, 'id'> | Pick<AdminTypes.ScriptTag, 'id'> | Pick<AdminTypes.Segment, 'id'> | Pick<AdminTypes.SellingPlan, 'id'> | Pick<AdminTypes.SellingPlanGroup, 'id'> | Pick<AdminTypes.ServerPixel, 'id'> | Pick<AdminTypes.Shop, 'id'> | Pick<AdminTypes.ShopAddress, 'id'> | Pick<AdminTypes.ShopPolicy, 'id'> | Pick<AdminTypes.ShopifyPaymentsAccount, 'id'> | Pick<AdminTypes.ShopifyPaymentsBalanceTransaction, 'id'> | Pick<AdminTypes.ShopifyPaymentsBankAccount, 'id'> | Pick<AdminTypes.ShopifyPaymentsDispute, 'id'> | Pick<AdminTypes.ShopifyPaymentsDisputeEvidence, 'id'> | Pick<AdminTypes.ShopifyPaymentsDisputeFileUpload, 'id'> | Pick<AdminTypes.ShopifyPaymentsDisputeFulfillment, 'id'> | Pick<AdminTypes.ShopifyPaymentsPayout, 'id'> | Pick<AdminTypes.StaffMember, 'id'> | Pick<AdminTypes.StandardMetafieldDefinitionTemplate, 'id'> | Pick<AdminTypes.StoreCreditAccount, 'id'> | Pick<AdminTypes.StoreCreditAccountCreditTransaction, 'id'> | Pick<AdminTypes.StoreCreditAccountDebitRevertTransaction, 'id'> | Pick<AdminTypes.StoreCreditAccountDebitTransaction, 'id'> | Pick<AdminTypes.StorefrontAccessToken, 'id'> | Pick<AdminTypes.SubscriptionBillingAttempt, 'id'> | Pick<AdminTypes.SubscriptionContract, 'id'> | Pick<AdminTypes.SubscriptionDraft, 'id'> | Pick<AdminTypes.TaxonomyAttribute, 'id'> | Pick<AdminTypes.TaxonomyCategory, 'id'> | Pick<AdminTypes.TaxonomyChoiceListAttribute, 'id'> | Pick<AdminTypes.TaxonomyMeasurementAttribute, 'id'> | Pick<AdminTypes.TaxonomyValue, 'id'> | Pick<AdminTypes.TenderTransaction, 'id'> | Pick<AdminTypes.TransactionFee, 'id'> | Pick<AdminTypes.UnverifiedReturnLineItem, 'id'> | Pick<AdminTypes.UrlRedirect, 'id'> | Pick<AdminTypes.UrlRedirectImport, 'id'> | Pick<AdminTypes.Validation, 'id'> | Pick<AdminTypes.Video, 'id'> | Pick<AdminTypes.WebPixel, 'id'> | Pick<AdminTypes.WebhookSubscription, 'id'>> }> };

export type DiscountAutomaticBasicCreateMutationVariables = AdminTypes.Exact<{
  automaticBasicDiscount: AdminTypes.DiscountAutomaticBasicInput;
}>;


export type DiscountAutomaticBasicCreateMutation = { discountAutomaticBasicCreate?: AdminTypes.Maybe<{ automaticDiscountNode?: AdminTypes.Maybe<(
      Pick<AdminTypes.DiscountAutomaticNode, 'id'>
      & { automaticDiscount: Pick<AdminTypes.DiscountAutomaticBasic, 'title'> }
    )>, userErrors: Array<Pick<AdminTypes.DiscountUserError, 'field' | 'message'>> }> };

export type CreateAppDataMutationVariables = AdminTypes.Exact<{
  metafields: Array<AdminTypes.MetafieldsSetInput> | AdminTypes.MetafieldsSetInput;
}>;


export type CreateAppDataMutation = { metafieldsSet?: AdminTypes.Maybe<{ userErrors: Array<Pick<AdminTypes.MetafieldsSetUserError, 'field' | 'message'>> }> };

export type SubscriptionContractUpdateMutationVariables = AdminTypes.Exact<{
  contractId: AdminTypes.Scalars['ID']['input'];
}>;


export type SubscriptionContractUpdateMutation = { subscriptionContractUpdate?: AdminTypes.Maybe<{ draft?: AdminTypes.Maybe<Pick<AdminTypes.SubscriptionDraft, 'id'>>, userErrors: Array<Pick<AdminTypes.SubscriptionDraftUserError, 'field' | 'message'>> }> };

export type SubscriptionDraftUpdateMutationVariables = AdminTypes.Exact<{
  draftId: AdminTypes.Scalars['ID']['input'];
  input: AdminTypes.SubscriptionDraftInput;
}>;


export type SubscriptionDraftUpdateMutation = { subscriptionDraftUpdate?: AdminTypes.Maybe<{ draft?: AdminTypes.Maybe<Pick<AdminTypes.SubscriptionDraft, 'id' | 'status'>>, userErrors: Array<Pick<AdminTypes.SubscriptionDraftUserError, 'field' | 'message'>> }> };

export type SubscriptionDraftCommitMutationVariables = AdminTypes.Exact<{
  draftId: AdminTypes.Scalars['ID']['input'];
}>;


export type SubscriptionDraftCommitMutation = { subscriptionDraftCommit?: AdminTypes.Maybe<{ contract?: AdminTypes.Maybe<Pick<AdminTypes.SubscriptionContract, 'id' | 'status'>>, userErrors: Array<Pick<AdminTypes.SubscriptionDraftUserError, 'field' | 'message'>> }> };

export type GetContractsQueryVariables = AdminTypes.Exact<{
  first: AdminTypes.Scalars['Int']['input'];
}>;


export type GetContractsQuery = { subscriptionContracts: { edges: Array<{ node: (
        Pick<AdminTypes.SubscriptionContract, 'id' | 'status' | 'nextBillingDate'>
        & { customer?: AdminTypes.Maybe<Pick<AdminTypes.Customer, 'displayName' | 'email'>>, lines: { edges: Array<{ node: Pick<AdminTypes.SubscriptionLine, 'title' | 'quantity'> }> } }
      ) }> } };

export type GetProductCollectionsQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type GetProductCollectionsQuery = { product?: AdminTypes.Maybe<{ collections: { nodes: Array<Pick<AdminTypes.Collection, 'id'>> } }> };

export type SubscriptionsProductsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type SubscriptionsProductsQuery = { products: { edges: Array<{ node: (
        Pick<AdminTypes.Product, 'id' | 'title'>
        & { priceRangeV2: { minVariantPrice: Pick<AdminTypes.MoneyV2, 'amount'> } }
      ) }> } };

export type SellingPlanGroupDeleteMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type SellingPlanGroupDeleteMutation = { sellingPlanGroupDelete?: AdminTypes.Maybe<Pick<AdminTypes.SellingPlanGroupDeletePayload, 'deletedSellingPlanGroupId'>> };

export type SellingPlanGroupCreateMutationVariables = AdminTypes.Exact<{
  input: AdminTypes.SellingPlanGroupInput;
}>;


export type SellingPlanGroupCreateMutation = { sellingPlanGroupCreate?: AdminTypes.Maybe<{ sellingPlanGroup?: AdminTypes.Maybe<(
      Pick<AdminTypes.SellingPlanGroup, 'id'>
      & { sellingPlans: { edges: Array<{ node: (
            Pick<AdminTypes.SellingPlan, 'id'>
            & { billingPolicy: Pick<AdminTypes.SellingPlanRecurringBillingPolicy, 'interval' | 'intervalCount'> }
          ) }> } }
    )>, userErrors: Array<Pick<AdminTypes.SellingPlanGroupUserError, 'field' | 'message'>> }> };

export type SellingPlanGroupAddProductsMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  productIds: Array<AdminTypes.Scalars['ID']['input']> | AdminTypes.Scalars['ID']['input'];
}>;


export type SellingPlanGroupAddProductsMutation = { sellingPlanGroupAddProducts?: AdminTypes.Maybe<{ userErrors: Array<Pick<AdminTypes.SellingPlanGroupUserError, 'message'>> }> };

export type GetCustomerContractsQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type GetCustomerContractsQuery = { customer?: AdminTypes.Maybe<(
    Pick<AdminTypes.Customer, 'firstName'>
    & { subscriptionContracts: { nodes: Array<(
        Pick<AdminTypes.SubscriptionContract, 'id' | 'status' | 'nextBillingDate'>
        & { lines: { edges: Array<{ node: Pick<AdminTypes.SubscriptionLine, 'title'> }> }, billingPolicy: Pick<AdminTypes.SubscriptionBillingPolicy, 'interval' | 'intervalCount'> }
      )> } }
  )> };

export type VerifyContractCustomerQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type VerifyContractCustomerQuery = { subscriptionContract?: AdminTypes.Maybe<(
    Pick<AdminTypes.SubscriptionContract, 'id'>
    & { customer?: AdminTypes.Maybe<Pick<AdminTypes.Customer, 'id'>> }
  )> };

export type CancelContractMutationVariables = AdminTypes.Exact<{
  subscriptionContractId: AdminTypes.Scalars['ID']['input'];
}>;


export type CancelContractMutation = { subscriptionContractCancel?: AdminTypes.Maybe<{ contract?: AdminTypes.Maybe<Pick<AdminTypes.SubscriptionContract, 'id' | 'status'>>, userErrors: Array<Pick<AdminTypes.SubscriptionContractStatusUpdateUserError, 'field' | 'message'>> }> };

export type WebhookShopNameQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type WebhookShopNameQuery = { shop: Pick<AdminTypes.Shop, 'name'> };

export type GetCustomerEmailQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type GetCustomerEmailQuery = { customer?: AdminTypes.Maybe<Pick<AdminTypes.Customer, 'email'>> };

interface GeneratedQueryTypes {
  "#graphql\n      query BillingInfo {\n        shop {\n          plan {\n            displayName\n            partnerDevelopment\n          }\n        }\n        currentAppInstallation {\n          activeSubscriptions {\n            name\n            status\n            test\n          }\n        }\n      }\n    ": {return: BillingInfoQuery, variables: BillingInfoQueryVariables},
  "#graphql\n    query BundlesShopInfo {\n      shop {\n        id\n        currencyFormats {\n          moneyInEmailsFormat\n        }\n      }\n    }": {return: BundlesShopInfoQuery, variables: BundlesShopInfoQueryVariables},
  "#graphql\n    query GetContracts($first: Int!) {\n      subscriptionContracts(first: $first, reverse: true) {\n        edges {\n          node {\n            id\n            status\n            nextBillingDate\n            customer { displayName email }\n            lines(first: 3) { edges { node { title quantity } } }\n          }\n        }\n      }\n    }": {return: GetContractsQuery, variables: GetContractsQueryVariables},
  "#graphql\n        query getProductCollections($id: ID!) {\n          product(id: $id) {\n            collections(first: 10) {\n              nodes { id }\n            }\n          }\n        }": {return: GetProductCollectionsQuery, variables: GetProductCollectionsQueryVariables},
  "#graphql\n      query SubscriptionsProducts {\n        products(first: 50) { edges { node { id title priceRangeV2 { minVariantPrice { amount } } } } }\n      }\n    ": {return: SubscriptionsProductsQuery, variables: SubscriptionsProductsQueryVariables},
  "#graphql\n      query getCustomerContracts($id: ID!) {\n        customer(id: $id) {\n          firstName\n          subscriptionContracts(first: 10) {\n            nodes {\n              id\n              status\n              nextBillingDate\n              lines(first: 5) { \n                edges { \n                  node { title } \n                } \n              }\n              billingPolicy { \n                interval\n                intervalCount\n              }\n            }\n          }\n        }\n      }": {return: GetCustomerContractsQuery, variables: GetCustomerContractsQueryVariables},
  "#graphql\n      query VerifyContractCustomer($id: ID!) {\n        subscriptionContract(id: $id) {\n          id\n          customer { id }\n        }\n      }": {return: VerifyContractCustomerQuery, variables: VerifyContractCustomerQueryVariables},
  "#graphql\n      query WebhookShopName {\n        shop {\n          name\n        }\n      }": {return: WebhookShopNameQuery, variables: WebhookShopNameQueryVariables},
  "#graphql\n            query getCustomerEmail($id: ID!) {\n              customer(id: $id) {\n                email\n              }\n            }": {return: GetCustomerEmailQuery, variables: GetCustomerEmailQueryVariables},
  "#graphql\n            query getProductCollections($id: ID!) {\n              product(id: $id) {\n                collections(first: 10) {\n                  nodes { id }\n                }\n              }\n            }": {return: GetProductCollectionsQuery, variables: GetProductCollectionsQueryVariables},
}

interface GeneratedMutationTypes {
  "#graphql\n                mutation discountAutomaticDelete($id: ID!) {\n                  discountAutomaticDelete(id: $id) {\n                    userErrors { field message }\n                  }\n                }": {return: DiscountAutomaticDeleteMutation, variables: DiscountAutomaticDeleteMutationVariables},
  "#graphql\n                mutation addTags($id: ID!, $tags: [String!]!) {\n                    tagsAdd(id: $id, tags: $tags) {\n                        node { id }\n                    }\n                }": {return: AddTagsMutation, variables: AddTagsMutationVariables},
  "#graphql\n                mutation discountAutomaticBasicCreate($automaticBasicDiscount: DiscountAutomaticBasicInput!) {\n                  discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {\n                    automaticDiscountNode {\n                       id\n                       automaticDiscount {\n                         ... on DiscountAutomaticBasic { title }\n                       }\n                    }\n                    userErrors { field message }\n                  }\n                }": {return: DiscountAutomaticBasicCreateMutation, variables: DiscountAutomaticBasicCreateMutationVariables},
  "#graphql\n    mutation CreateAppData($metafields: [MetafieldsSetInput!]!) {\n      metafieldsSet(metafields: $metafields) {\n        userErrors { field message }\n      }\n    }": {return: CreateAppDataMutation, variables: CreateAppDataMutationVariables},
  "#graphql\n  mutation subscriptionContractUpdate($contractId: ID!) {\n    subscriptionContractUpdate(contractId: $contractId) {\n      draft {\n        id\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: SubscriptionContractUpdateMutation, variables: SubscriptionContractUpdateMutationVariables},
  "#graphql\n  mutation subscriptionDraftUpdate($draftId: ID!, $input: SubscriptionDraftInput!) {\n    subscriptionDraftUpdate(draftId: $draftId, input: $input) {\n      draft {\n        id\n        status\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: SubscriptionDraftUpdateMutation, variables: SubscriptionDraftUpdateMutationVariables},
  "#graphql\n  mutation subscriptionDraftCommit($draftId: ID!) {\n    subscriptionDraftCommit(draftId: $draftId) {\n      contract {\n        id\n        status\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: SubscriptionDraftCommitMutation, variables: SubscriptionDraftCommitMutationVariables},
  "#graphql\n          mutation sellingPlanGroupDelete($id: ID!) {\n            sellingPlanGroupDelete(id: $id) { deletedSellingPlanGroupId }\n          }": {return: SellingPlanGroupDeleteMutation, variables: SellingPlanGroupDeleteMutationVariables},
  "#graphql\n        mutation sellingPlanGroupCreate($input: SellingPlanGroupInput!) {\n          sellingPlanGroupCreate(input: $input) {\n            sellingPlanGroup { \n              id \n              sellingPlans(first: 10) { \n                edges { node { id billingPolicy { ... on SellingPlanRecurringBillingPolicy { interval intervalCount } } } } \n              } \n            }\n            userErrors { field message }\n          }\n        }": {return: SellingPlanGroupCreateMutation, variables: SellingPlanGroupCreateMutationVariables},
  "#graphql\n          mutation sellingPlanGroupAddProducts($id: ID!, $productIds: [ID!]!) {\n            sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {\n              userErrors { message }\n            }\n          }": {return: SellingPlanGroupAddProductsMutation, variables: SellingPlanGroupAddProductsMutationVariables},
  "#graphql\n      mutation cancelContract($subscriptionContractId: ID!) {\n        subscriptionContractCancel(subscriptionContractId: $subscriptionContractId) {\n          contract { id status }\n          userErrors { field message }\n        }\n      }": {return: CancelContractMutation, variables: CancelContractMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}

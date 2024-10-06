/**
 * transaction controller
 */


import { factories } from '@strapi/strapi';
import { Invoice as InvoiceClient } from 'xendit-node';
import { Invoice, InvoiceItem, InvoiceCallback } from 'xendit-node/invoice/models'

const xenditInvoiceClient = new InvoiceClient({ secretKey: process.env.XENDIT_SECRET_KEY })

interface DefaultQuery {
    filters?: any;
    populate?: any;
    sort?: any;
    pagination?: {
        page?: number;
        pageSize?: number;
        start?: number;
        limit?: number;
    };
}

export default factories.createCoreController('api::transaction.transaction', ({ strapi }) => ({
    async create(ctx) {
        const { body } = ctx.request;
        try {
            let discountAmount = 0;

            const paymentMethod = await strapi.documents("api::payment-method.payment-method").findOne({
                documentId: body.payment_method
            })

            if (!paymentMethod) {
                return ctx.badRequest('Invalid Method Not Found');
            }

            if (body.voucher) {
                const voucher: any = await strapi.documents('api::voucher.voucher').findOne({
                    documentId: body.voucher
                })
                if (!voucher) {
                    return ctx.badRequest('Invalid Voucher');
                }
                discountAmount = voucher ? parseFloat(voucher.discount) : 0;
            }

            const transaction = await strapi.documents('api::transaction.transaction').create({
                data: {
                    number: generateRandomNumber(),
                    customer_phone: body.customer_phone,
                    customer_name: body.customer_name,
                    customer_email: body.customer_email,
                    shipping_province: body.shipping_province,
                    shipping_city: body.shipping_city,
                    shipping_district: body.shipping_district,
                    shipping_village: body.shipping_village,
                    shipping_address: body.shipping_address,
                    shipping_postal: body.shipping_postal,
                    payment_method: body.payment_method,
                    voucher: body.voucher,
                    users_permissions_user: body.user,
                    discount: discountAmount,
                    transaction_status: 'unpaid'
                },
                status: "draft"
            })

            let totalTransaction = 0;

            let InvoiceItems: InvoiceItem[] = []

            await Promise.all(
                body.orders.map(async (orderData: any) => {

                    const product = await strapi.documents('api::product.product').findOne({
                        documentId: orderData.product
                    })

                    if (!product) {
                        return ctx.badRequest(`Product ${orderData.product} Not Found`);
                    }

                    const variantPriceAdjustment = await Promise.all(
                        orderData.order_variants.map(async (orderVariant: any) => {
                            const variant = await strapi.documents('api::variant.variant').findOne({
                                documentId: orderVariant.variant
                            });
                            if (!variant) {
                                return ctx.badRequest(`Variant ${orderVariant.variant} Not Found`);
                            }
                            return variant.price_adjustment || 0
                        })
                    );


                    const totalVariantPriceAdjustment = variantPriceAdjustment.reduce((sum, adjustment) => sum + adjustment, 0);

                    console.log(totalVariantPriceAdjustment)

                    const order = await strapi.documents("api::order.order").create({
                        data: {
                            number: generateRandomNumber(),
                            product: product.documentId,
                            transaction: transaction.documentId,
                            quantity: orderData.quantity,
                            unit_price: product.price + totalVariantPriceAdjustment,
                            total: product.price + totalVariantPriceAdjustment * orderData.quantity,
                            order_status: 'pending',
                        }
                    })

                    await Promise.all(
                        orderData.order_variants.map(async (orderVariantData: any) => {
                            await strapi.documents("api::order-variant.order-variant").create({
                                data: {
                                    order: order.documentId,
                                    variant: orderVariantData.variant
                                }
                            })
                        })
                    )

                    InvoiceItems.push({
                        name: product.name,
                        price: product.price + totalVariantPriceAdjustment,
                        quantity: orderData.quantity,
                        category: product.brand,
                        url: "https://unshift.store/products/" + product.slug,
                    })

                    totalTransaction += product.price + totalVariantPriceAdjustment * orderData.quantity
                })
            )

            const paymentInvoice: Invoice = await xenditInvoiceClient.createInvoice({
                data: {
                    amount: totalTransaction - discountAmount,
                    externalId: transaction.documentId,
                    customer: {
                        givenNames: transaction.customer_name,
                        email: transaction.customer_email,
                        mobileNumber: transaction.customer_phone,
                    },
                    currency: "IDR",
                    local: "id",
                    successRedirectUrl: "unshift.store/transaction/" + transaction.documentId,
                    failureRedirectUrl: "unshift.store/transaction/" + transaction.documentId,
                    description: "Pembayaran Pesanan " + transaction.number,
                    items: InvoiceItems,
                },
            })

            await strapi.documents("api::transaction.transaction").update({
                documentId: transaction.documentId,
                data: {
                    total: totalTransaction - discountAmount,
                    payment_id: paymentInvoice.id,
                    payment_link: paymentInvoice.invoiceUrl
                },
                status: 'published',
            })

            return ctx.body = {
                transaction: transaction.documentId,
                payment_link: paymentInvoice.invoiceUrl
            }

        } catch (error) {
            ctx.internalServerError(error);
        }
    },

    async find(ctx) {
        try {
            const user = ctx.state.user;

            if (!user) {
                return ctx.unauthorized('You must be logged in to view transactions');
            }

            const query = ctx.query as DefaultQuery;

            const updatedQuery = {
                filters: {
                    ...(query.filters || {}),
                    users_permissions_user: user.id
                },
                populate: {
                    orders: {
                        populate: {
                            product: true,
                            order_variants: {
                                populate: {
                                    variant: true
                                }
                            }
                        }
                    },
                    payment_method: true,
                    voucher: true
                },
                sort: query.sort,
                pagination: query.pagination
            };

            const sanitizedQuery = await this.sanitizeQuery(ctx);

            const finalQuery = {
                ...sanitizedQuery,
                ...updatedQuery
            };

            const { results, pagination } = await strapi.service('api::transaction.transaction').find(finalQuery);

            const sanitizedResults = await this.sanitizeOutput(results, ctx);

            return this.transformResponse(sanitizedResults, { pagination });
        } catch (error) {
            console.error('Error in find transactions:', error);
            return ctx.badRequest('Error retrieving transactions');
        }
    },

    async paymentCallback(ctx) {
        const body: InvoiceCallback = ctx.request.body;
        try {
            const markedStatus = ['PAID', 'EXPIRED']
            if (markedStatus.includes(body.status)) {
                await strapi.documents("api::transaction.transaction").update({
                    documentId: body.externalId,
                    data: {
                        transaction_status: body.status === 'PAID' ? 'paid' : 'expired'
                    }
                })
            }
        } catch {
        } finally {
            ctx.noContent("INVOICE-CALLBACK-RECEIVED-WITH-ERROR")
        }
    }
}));


const generateRandomNumber = () => {
    return Math.random().toString().slice(2, 10);
};

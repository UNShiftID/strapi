export default {
    routes: [
      {
        method: 'POST',
        path: '/transactions/payment-callback',
        handler: 'api::transaction.transaction.paymentCallback',
        config: {
          auth: false,
          policies: [],
          middlewares: [],
        },
      },
    ],
  };
  
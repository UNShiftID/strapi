module.exports = ({ env }) => ({
  'users-permissions': {
    config: {
      jwt: {
        expiresIn: '730d',
      },
      register: {
        allowedFields: ["fullname", "gender", "birthdate"],
      },
    },
  },
  upload: {
    config: {
      provider: 'aws-s3',
      providerOptions: {
        baseUrl: `https://${env('AWS_BUCKET_NAME')}.s3.${env('AWS_REGION')}.amazonaws.com`,
        s3Options: {
          credentials: {
            accessKeyId: env('AWS_ACCESS_KEY_ID'),
            secretAccessKey: env('AWS_ACCESS_SECRET'),
          },
          region: env('AWS_REGION'),
          params: {
            Bucket: env('AWS_BUCKET_NAME'),
          },
        },
      },
    },
  },
  email: {
    config: {
      provider: 'amazon-ses',
      providerOptions: {
        key: env('AWS_ACCESS_KEY_ID'),
        secret: env('AWS_ACCESS_SECRET'),
        amazon: `https://email.${env('AWS_REGION')}.amazonaws.com`,
      },
      settings: {
        defaultFrom: env('DEFAULT_FROM_EMAIL'),
        defaultReplyTo: env('DEFAULT_REPLY_TO_EMAIL'),
      },
    },
  },
});

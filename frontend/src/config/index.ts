export const config = {
  app: {
    name: 'THOR WEB',
    version: '1.0.0',
    description: 'Transformez vos fichiers MP3 en articles web avec l\'IA'
  },
  api: {
    // TODO: Remplacer par l'endpoint API Gateway réel après déploiement
    endpoint: process.env.REACT_APP_API_ENDPOINT || 'https://YOUR_API_ID.execute-api.eu-west-3.amazonaws.com/prod',
    region: 'eu-west-3'
  },
  cognito: {
    // TODO: Remplacer par les vraies valeurs Cognito après création
    userPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID || 'eu-west-3_XXXXXXXXX',
    clientId: process.env.REACT_APP_COGNITO_CLIENT_ID || 'XXXXXXXXXXXXXXXXXXXXXXXXXX',
    region: 'eu-west-3',
    domain: process.env.REACT_APP_COGNITO_DOMAIN || 'thor-web-auth',
    redirectUri: process.env.REACT_APP_REDIRECT_URI || 'http://localhost:3000',
    responseType: 'token'
  },
  upload: {
    maxFileSizeMB: 500,
    allowedFormats: ['.mp3'],
    pollingIntervalMs: 3000  // Poll job status every 3 seconds
  }
};

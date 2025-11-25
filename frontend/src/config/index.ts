export const config = {
  app: {
    name: 'THOR WEB',
    version: '1.0.0',
    description: 'Transformez vos fichiers MP3 en articles web avec l\'IA'
  },
  api: {
    // API unifiée Thor pour abonnements + génération articles
    endpoint: process.env.REACT_APP_API_ENDPOINT || 'https://n3gnin38qf.execute-api.eu-west-3.amazonaws.com/prod',
    // API spécifique pour upload et génération web (ancienne API thor-web)
    uploadEndpoint: 'https://0grw79hxx1.execute-api.eu-west-3.amazonaws.com/dev',
    region: 'eu-west-3'
  },
  cognito: {
    // Cognito Thor unifié (partagé avec titre.thorpodcast.link)
    userPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID || 'eu-west-3_abTBNREBJ',
    clientId: process.env.REACT_APP_COGNITO_CLIENT_ID || '4j9q6in6cpcsmroimb30b54d5s', // Public client (no secret)
    region: 'eu-west-3',
    domain: process.env.REACT_APP_COGNITO_DOMAIN || 'thor-auth',
    // Détecte automatiquement l'URL selon l'environnement
    redirectUri: window.location.origin.includes('localhost')
      ? 'http://localhost:3000'
      : window.location.origin,
    logoutUri: window.location.origin.includes('localhost')
      ? 'http://localhost:3000'
      : window.location.origin,
    responseType: 'token'
  },
  // Configuration Saint-Esprit Cognito
  saintEspritCognito: {
    userPoolId: 'eu-west-3_oD1fm8OLs',
    clientId: '5jst6bnhl26ekdr5a7pu9ik2f5',
    region: 'eu-west-3',
    domain: 'saint-esprit-radio-users',
    redirectUri: window.location.origin.includes('localhost')
      ? 'http://localhost:8080/'
      : window.location.origin + '/',
    logoutUri: window.location.origin.includes('localhost')
      ? 'http://localhost:8080/'
      : window.location.origin + '/',
    responseType: 'token'
  },
  upload: {
    maxFileSizeMB: 500,
    allowedFormats: ['.mp3'],
    pollingIntervalMs: 3000  // Poll job status every 3 seconds
  }
};

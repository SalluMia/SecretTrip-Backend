// config/firebase.js
const admin = require('firebase-admin');

// Helper function to format private key properly
function formatPrivateKey(privateKey) {
  if (!privateKey) return null;
  
  // Remove extra quotes and ensure proper line breaks
  return privateKey
    .replace(/\\n/g, '\n')
    .replace(/^"/, '')
    .replace(/"$/, '')
    .trim();
}

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  try {
    // Validate required environment variables
    const requiredVars = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_PRIVATE_KEY',
      'FIREBASE_CLIENT_EMAIL'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.warn(`⚠️ Missing Firebase environment variables: ${missingVars.join(', ')}`);
      console.warn('⚠️ FCM functionality will be disabled');
      module.exports = null;
      return;
    }

    // Format the private key properly
    const formattedPrivateKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY);
    
    if (!formattedPrivateKey) {
      throw new Error('Invalid FIREBASE_PRIVATE_KEY format');
    }

    // Create service account object
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: formattedPrivateKey,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.FIREBASE_CLIENT_EMAIL)}`,
      universe_domain: "googleapis.com"
    };

    // Validate private key format
    if (!serviceAccount.private_key.includes('BEGIN PRIVATE KEY')) {
      throw new Error('Private key does not appear to be in correct PEM format');
    }

    // Initialize Firebase Admin
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID
    });

    console.log(`✅ Firebase Admin SDK initialized successfully for project: ${process.env.FIREBASE_PROJECT_ID}`);

  } catch (error) {
    console.error('❌ Firebase Admin SDK initialization failed:', error.message);
    console.error('🔧 Possible solutions:');
    console.error('   1. Check your .env file private key format');
    console.error('   2. Ensure private key is on one line with \\n for line breaks');
    console.error('   3. Verify all Firebase environment variables are set');
    console.error('   4. Check that your service account has proper permissions');
    
    // Don't crash the app, just disable Firebase
    module.exports = null;
    return;
  }
} else {
  console.log('🔄 Firebase Admin SDK already initialized');
}

module.exports = admin;
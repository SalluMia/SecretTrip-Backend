#!/usr/bin/env node

// Simple album generation test script
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m'
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

// Test without authentication first
const testBasicEndpoints = async () => {
  log('🧪 Testing Basic Endpoints (No Auth Required)', 'bright');
  log('================================================', 'bright');

  // Test 1: Server health check
  try {
    // Try a POST to login endpoint with empty body to check if server responds
    await axios.post(`${BASE_URL}/auth/login`, {});
    log('✅ Server is running (responds to API calls)', 'green');
  } catch (error) {
    if (error.response && error.response.status) {
      // Server is responding, just with an error (which is expected for empty login)
      log('✅ Server is running and responding', 'green');
    } else {
      log('❌ Server appears to be down', 'red');
      return false;
    }
  }

  return true;
};

// Test with manual token input
const testWithAuth = async () => {
  log('\n🔐 Testing with Authentication', 'bright');
  log('================================', 'bright');
  
  // For now, let's create a test user or use existing credentials
  log('ℹ️  To test with authentication, you need to:', 'cyan');
  log('   1. Register/login a user manually', 'cyan');
  log('   2. Get the auth token', 'cyan');
  log('   3. Set TOKEN environment variable', 'cyan');
  log('   4. Run: TOKEN=your_token node simple-album-test.js', 'cyan');

  const token = process.env.TOKEN;
  if (!token) {
    log('⚠️  No TOKEN environment variable found. Skipping auth tests.', 'yellow');
    return false;
  }

  // Test authenticated endpoints
  const headers = { Authorization: `Bearer ${token}` };

  try {
    // Test Scaleway operations
    log('\n🔧 Testing Scaleway Operations...');
    const scalewayResult = await axios.get(`${BASE_URL}/test/scaleway-operations`, { headers });
    
    if (scalewayResult.data.success) {
      const { summary } = scalewayResult.data.data;
      log(`✅ Scaleway tests: ${summary.passed}/${summary.total} passed`, 'green');
    } else {
      log('❌ Scaleway operations failed', 'red');
    }
  } catch (error) {
    log(`❌ Scaleway test error: ${error.response?.data?.message || error.message}`, 'red');
  }

  try {
    // Test simple PDF creation
    log('\n📄 Testing Simple PDF Creation...');
    const pdfResult = await axios.post(`${BASE_URL}/test/create-pdf`, {}, { headers });
    
    if (pdfResult.data.success) {
      const { pdf } = pdfResult.data.data;
      log(`✅ Test PDF created: ${pdf.size} bytes`, 'green');
      log(`   File exists: ${pdf.fileExists}`, pdf.fileExists ? 'green' : 'red');
    } else {
      log('❌ PDF creation failed', 'red');
    }
  } catch (error) {
    log(`❌ PDF creation error: ${error.response?.data?.message || error.message}`, 'red');
  }

  return true;
};

// Manual test instructions
const showManualTestInstructions = () => {
  log('\n📋 Manual Testing Instructions', 'bright');
  log('===============================', 'bright');
  
  log('\n1. 🔐 Get Authentication Token:', 'cyan');
  log('   POST /api/auth/login', 'cyan');
  log('   Body: { "email": "your@email.com", "password": "yourpassword" }', 'cyan');
  
  log('\n2. 🧪 Test Scaleway Operations:', 'cyan');
  log('   GET /api/test/scaleway-operations', 'cyan');
  log('   Headers: { "Authorization": "Bearer YOUR_TOKEN" }', 'cyan');
  
  log('\n3. 📄 Test PDF Creation:', 'cyan');
  log('   POST /api/test/create-pdf', 'cyan');
  log('   Headers: { "Authorization": "Bearer YOUR_TOKEN" }', 'cyan');
  
  log('\n4. 🎯 Test Album Generation (need trip with missions):', 'cyan');
  log('   GET /api/test/pdf-generation/TRIP_ID', 'cyan');
  log('   GET /api/test/album-service/TRIP_ID', 'cyan');
  
  log('\n5. 📸 Test File Overwrite:', 'cyan');
  log('   POST /api/test/file-overwrite?fileType=profile', 'cyan');
  log('   Body: FormData with profilePhoto file', 'cyan');

  log('\n💡 Quick Test Commands:', 'yellow');
  log('   # Test server health:', 'yellow');
  log('   curl http://localhost:5000/api/auth/login', 'yellow');
  
  log('\n   # Test with token (replace YOUR_TOKEN):', 'yellow');
  log('   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/test/scaleway-operations', 'yellow');
  
  log('\n   # Test PDF creation:', 'yellow');
  log('   curl -X POST -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/test/create-pdf', 'yellow');
};

// Create a sample curl script
const createCurlTestScript = () => {
  const curlScript = `#!/bin/bash

# Album Generation Test Script using curl
# Usage: ./test-album-curl.sh YOUR_AUTH_TOKEN

if [ -z "$1" ]; then
  echo "Usage: $0 <auth_token>"
  echo "Get auth token by logging in first:"
  echo 'curl -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d '"'"'{"email":"your@email.com","password":"yourpassword"}'"'"''
  exit 1
fi

TOKEN="$1"
BASE_URL="http://localhost:5000/api"

echo "🧪 Testing Album Generation with curl"
echo "====================================="

echo ""
echo "🔧 Testing Scaleway Operations..."
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/test/scaleway-operations" | jq '.'

echo ""
echo "📄 Testing PDF Creation..."
curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE_URL/test/create-pdf" | jq '.'

echo ""
echo "✅ Tests completed!"
echo ""
echo "To test album generation for a specific trip:"
echo "curl -H \\"Authorization: Bearer $TOKEN\\" \\"$BASE_URL/test/pdf-generation/TRIP_ID\\""
`;

  require('fs').writeFileSync('/Users/sulemankhan/trip/SecretTrip-Backend/test-album-curl.sh', curlScript);
  require('fs').chmodSync('/Users/sulemankhan/trip/SecretTrip-Backend/test-album-curl.sh', '755');
  
  log('\n📝 Created curl test script: test-album-curl.sh', 'green');
  log('   Usage: ./test-album-curl.sh YOUR_AUTH_TOKEN', 'green');
};

// Main function
const main = async () => {
  log('🚀 Simple Album Generation Test', 'bright');
  log('===============================', 'bright');

  // Test basic endpoints
  const serverRunning = await testBasicEndpoints();
  
  if (!serverRunning) {
    log('\n❌ Server is not running. Please start the server first:', 'red');
    log('   npm start', 'red');
    process.exit(1);
  }

  // Test with authentication if token provided
  await testWithAuth();

  // Show manual instructions
  showManualTestInstructions();

  // Create curl script
  createCurlTestScript();

  log('\n🎉 Basic tests completed!', 'green');
  log('Use the manual instructions above to test with authentication.', 'cyan');
};

// Run the test
main().catch(error => {
  log(`❌ Test failed: ${error.message}`, 'red');
  process.exit(1);
});

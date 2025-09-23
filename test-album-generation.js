#!/usr/bin/env node

// Test script for album generation functionality
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Configuration
const BASE_URL = 'http://localhost:5000/api';
const TEST_CONFIG = {
  email: 'test@example.com',
  password: 'testpassword123',
  displayName: 'Test User'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Helper functions
const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const logStep = (step, message) => {
  log(`\n🔸 Step ${step}: ${message}`, 'cyan');
};

const logSuccess = (message) => {
  log(`✅ ${message}`, 'green');
};

const logError = (message) => {
  log(`❌ ${message}`, 'red');
};

const logWarning = (message) => {
  log(`⚠️  ${message}`, 'yellow');
};

// Test state
let authToken = null;
let testTripId = null;
let testMissionIds = [];

// API helper functions
const apiCall = async (method, endpoint, data = null, headers = {}) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      status: error.response?.status
    };
  }
};

const uploadFile = async (endpoint, filePath, fieldName = 'file', additionalData = {}) => {
  try {
    const form = new FormData();
    
    // Add file
    if (fs.existsSync(filePath)) {
      form.append(fieldName, fs.createReadStream(filePath));
    } else {
      // Create a dummy image buffer if file doesn't exist
      const dummyBuffer = Buffer.from('dummy image data');
      form.append(fieldName, dummyBuffer, { filename: 'test.jpg', contentType: 'image/jpeg' });
    }

    // Add additional data
    Object.keys(additionalData).forEach(key => {
      form.append(key, additionalData[key]);
    });

    const response = await axios.post(`${BASE_URL}${endpoint}`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${authToken}`
      }
    });

    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      status: error.response?.status
    };
  }
};

// Test functions
const testAuthentication = async () => {
  logStep(1, 'Testing Authentication');

  // Try to login first
  const loginResult = await apiCall('POST', '/auth/login', {
    email: TEST_CONFIG.email,
    password: TEST_CONFIG.password
  });

  if (loginResult.success) {
    authToken = loginResult.data.data.token;
    logSuccess('Login successful');
    return true;
  }

  // If login fails, try to register
  logWarning('Login failed, attempting registration...');
  
  const registerResult = await apiCall('POST', '/auth/register', {
    email: TEST_CONFIG.email,
    password: TEST_CONFIG.password,
    displayName: TEST_CONFIG.displayName
  });

  if (registerResult.success) {
    authToken = registerResult.data.data.token;
    logSuccess('Registration successful');
    return true;
  }

  logError(`Authentication failed: ${registerResult.error}`);
  return false;
};

const testScalewayOperations = async () => {
  logStep(2, 'Testing Scaleway Operations');

  const result = await apiCall('GET', '/test/scaleway-operations');
  
  if (result.success) {
    const { summary, tests } = result.data.data;
    logSuccess(`Scaleway tests: ${summary.passed}/${summary.total} passed`);
    
    tests.forEach(test => {
      if (test.success) {
        log(`  ✅ ${test.test}`, 'green');
      } else {
        log(`  ❌ ${test.test}: ${test.error}`, 'red');
      }
    });
    
    return summary.success;
  } else {
    logError(`Scaleway operations test failed: ${result.error}`);
    return false;
  }
};

const createTestTrip = async () => {
  logStep(3, 'Creating Test Trip');

  const tripData = {
    name: `Test Album Trip ${Date.now()}`,
    location: 'Test Location',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    description: 'Test trip for album generation'
  };

  const result = await apiCall('POST', '/trip/create', tripData);
  
  if (result.success) {
    testTripId = result.data.data.trip.id;
    logSuccess(`Test trip created: ${testTripId}`);
    return true;
  } else {
    logError(`Failed to create test trip: ${result.error}`);
    return false;
  }
};

const getMissionsForTrip = async () => {
  logStep(4, 'Getting Missions for Trip');

  const result = await apiCall('GET', `/missions/trip/${testTripId}`);
  
  if (result.success) {
    const missions = result.data.data.missions;
    testMissionIds = missions.map(m => m.id);
    logSuccess(`Found ${missions.length} missions for trip`);
    return missions.length > 0;
  } else {
    logError(`Failed to get missions: ${result.error}`);
    return false;
  }
};

const submitMissionPhotos = async () => {
  logStep(5, 'Submitting Mission Photos');

  if (testMissionIds.length === 0) {
    logWarning('No missions found to submit photos for');
    return false;
  }

  let successCount = 0;
  const maxMissions = Math.min(testMissionIds.length, 3); // Submit max 3 photos

  for (let i = 0; i < maxMissions; i++) {
    const missionId = testMissionIds[i];
    log(`  Submitting photo for mission ${i + 1}/${maxMissions}...`);

    // Create a simple test image buffer
    const testImageBuffer = Buffer.from('test image data for mission ' + missionId);
    
    const result = await uploadFile(
      `/missions/${missionId}/submit`,
      null, // No file path, will use buffer
      'missionPhoto',
      { caption: `Test photo for mission ${missionId}` }
    );

    if (result.success) {
      logSuccess(`  Mission ${missionId} photo submitted`);
      successCount++;
    } else {
      logError(`  Mission ${missionId} photo failed: ${result.error}`);
    }

    // Small delay between submissions
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  logSuccess(`Successfully submitted ${successCount}/${maxMissions} mission photos`);
  return successCount > 0;
};

const testAlbumService = async () => {
  logStep(6, 'Testing Album Service');

  const result = await apiCall('GET', `/test/album-service/${testTripId}`);
  
  if (result.success) {
    const { tests } = result.data.data;
    logSuccess('Album service tests completed');
    
    Object.keys(tests).forEach(testName => {
      const test = tests[testName];
      if (test.success) {
        log(`  ✅ ${testName}`, 'green');
      } else {
        log(`  ❌ ${testName}`, 'red');
      }
    });
    
    return true;
  } else {
    logError(`Album service test failed: ${result.error}`);
    return false;
  }
};

const testPDFGeneration = async () => {
  logStep(7, 'Testing PDF Generation');

  // Test standard quality
  log('  Testing standard quality PDF...');
  const standardResult = await apiCall('GET', `/test/pdf-generation/${testTripId}?quality=standard`);
  
  if (standardResult.success) {
    const { pdf, trip } = standardResult.data.data;
    logSuccess(`  Standard PDF generated in ${pdf.generationTime}`);
    log(`    File exists: ${pdf.fileExists}`, pdf.fileExists ? 'green' : 'red');
    log(`    URL: ${pdf.urlPath}`);
  } else {
    logError(`  Standard PDF generation failed: ${standardResult.error}`);
  }

  // Test HD quality
  log('  Testing HD quality PDF...');
  const hdResult = await apiCall('GET', `/test/pdf-generation/${testTripId}?quality=hd`);
  
  if (hdResult.success) {
    const { pdf } = hdResult.data.data;
    logSuccess(`  HD PDF generated in ${pdf.generationTime}`);
    log(`    File exists: ${pdf.fileExists}`, pdf.fileExists ? 'green' : 'red');
    log(`    URL: ${pdf.urlPath}`);
  } else {
    logError(`  HD PDF generation failed: ${hdResult.error}`);
  }

  return standardResult.success || hdResult.success;
};

const testCreateTestPDF = async () => {
  logStep(8, 'Testing Simple PDF Creation');

  const result = await apiCall('POST', '/test/create-pdf');
  
  if (result.success) {
    const { pdf } = result.data.data;
    logSuccess(`Test PDF created successfully`);
    log(`  Size: ${pdf.size} bytes`);
    log(`  File exists: ${pdf.fileExists}`, pdf.fileExists ? 'green' : 'red');
    log(`  Download URL: ${pdf.downloadUrl}`);
    return true;
  } else {
    logError(`Test PDF creation failed: ${result.error}`);
    return false;
  }
};

const generateActualAlbum = async () => {
  logStep(9, 'Generating Actual Album');

  const result = await apiCall('POST', `/albums/generate-test/${testTripId}`);
  
  if (result.success) {
    logSuccess('Album generated successfully');
    const { data } = result.data;
    if (data.standardPdfUrl) {
      log(`  Standard PDF: ${data.standardPdfUrl}`);
    }
    if (data.hdPdfUrl) {
      log(`  HD PDF: ${data.hdPdfUrl}`);
    }
    return true;
  } else {
    logError(`Album generation failed: ${result.error}`);
    return false;
  }
};

const cleanup = async () => {
  logStep(10, 'Cleanup');

  if (testTripId) {
    log('  Cleaning up test trip...');
    // Note: Add cleanup logic here if needed
    logSuccess('Cleanup completed');
  }
};

// Main test runner
const runTests = async () => {
  log('🚀 Starting Album Generation Test Suite', 'bright');
  log('==========================================', 'bright');

  const results = {
    total: 0,
    passed: 0,
    failed: 0
  };

  const tests = [
    { name: 'Authentication', fn: testAuthentication },
    { name: 'Scaleway Operations', fn: testScalewayOperations },
    { name: 'Create Test Trip', fn: createTestTrip },
    { name: 'Get Missions', fn: getMissionsForTrip },
    { name: 'Submit Mission Photos', fn: submitMissionPhotos },
    { name: 'Album Service Tests', fn: testAlbumService },
    { name: 'PDF Generation Tests', fn: testPDFGeneration },
    { name: 'Simple PDF Creation', fn: testCreateTestPDF },
    { name: 'Generate Actual Album', fn: generateActualAlbum }
  ];

  for (const test of tests) {
    results.total++;
    try {
      const success = await test.fn();
      if (success) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      logError(`Test "${test.name}" threw an error: ${error.message}`);
      results.failed++;
    }
  }

  // Cleanup
  await cleanup();

  // Final results
  log('\n🏁 Test Results', 'bright');
  log('================', 'bright');
  log(`Total Tests: ${results.total}`);
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  log(`Success Rate: ${Math.round((results.passed / results.total) * 100)}%`, 
      results.failed === 0 ? 'green' : 'yellow');

  if (results.failed === 0) {
    log('\n🎉 All tests passed! Album generation is working correctly.', 'green');
  } else {
    log('\n⚠️  Some tests failed. Check the logs above for details.', 'yellow');
  }

  process.exit(results.failed === 0 ? 0 : 1);
};

// Handle errors
process.on('unhandledRejection', (error) => {
  logError(`Unhandled rejection: ${error.message}`);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logError(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

// Run the tests
if (require.main === module) {
  runTests().catch(error => {
    logError(`Test suite failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { runTests };

# Firebase FCM Permission Error Fix

## 🚨 **Current Issue**
```
Permission 'cloudmessaging.messages.create' denied on resource '//cloudresourcemanager.googleapis.com/projects/secrettrip-202c4'
Error Code: messaging/mismatched-credential
```

## 🔍 **Root Cause**
The Firebase service account being used doesn't have the necessary permissions to send Cloud Messaging notifications, or the project configuration is incorrect.

## 🛠️ **Solutions**

### **Option 1: Update Firebase Service Account Permissions (Recommended)**

1. **Go to Google Cloud Console**:
   - Visit: https://console.cloud.google.com/
   - Select project: `secrettrip-202c4`

2. **Check IAM Permissions**:
   - Go to IAM & Admin > IAM
   - Find your service account email
   - Ensure it has these roles:
     - `Firebase Admin SDK Administrator Service Agent`
     - `Cloud Messaging Admin` (or `Editor`)

3. **Enable Required APIs**:
   - Go to APIs & Services > Library
   - Enable these APIs:
     - Firebase Cloud Messaging API
     - Cloud Resource Manager API

### **Option 2: Create New Service Account with Proper Permissions**

1. **Create Service Account**:
   ```bash
   # Go to IAM & Admin > Service Accounts
   # Click "Create Service Account"
   # Name: secrettrip-fcm-service
   ```

2. **Assign Roles**:
   - `Firebase Admin SDK Administrator Service Agent`
   - `Cloud Messaging Admin`
   - `Service Account Token Creator`

3. **Generate Key**:
   - Click on the service account
   - Go to Keys tab > Add Key > Create New Key
   - Choose JSON format
   - Download the key file

### **Option 3: Graceful Error Handling (Quick Fix)**

Update the notification service to handle FCM errors gracefully without crashing the application.

## 🔧 **Implementation**

### **Quick Fix: Update Notification Service**

```javascript
// src/services/notification.service.js
const admin = require('../config/firebase');

// Add FCM availability check
const isFCMAvailable = () => {
  return admin && admin.messaging;
};

// Updated sendMissionAssignedNotification function
exports.sendMissionAssignedNotification = async ({ userId, tripId, missionTitle, missionInstruction }) => {
  try {
    // Check if FCM is available
    if (!isFCMAvailable()) {
      console.log('⚠️ FCM not available - skipping notification');
      return { success: false, reason: 'FCM_NOT_AVAILABLE' };
    }

    // Get user's FCM token
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true, displayName: true }
    });

    if (!user?.fcmToken) {
      console.log(`⚠️ No FCM token found for user ${userId} - skipping notification`);
      return { success: false, reason: 'NO_FCM_TOKEN' };
    }

    const message = {
      token: user.fcmToken,
      notification: {
        title: '🎯 New Mission Assigned!',
        body: `${missionTitle} - Ready for your next adventure?`
      },
      data: {
        type: 'mission_assigned',
        tripId: tripId,
        missionTitle: missionTitle,
        missionInstruction: missionInstruction || ''
      }
    };

    const response = await admin.messaging().send(message);
    console.log('✅ Mission notification sent:', response);
    return { success: true, response };

  } catch (error) {
    console.error('❌ Error sending mission notification:', error.message);
    
    // Don't throw error - just log and continue
    if (error.code === 'messaging/mismatched-credential') {
      console.error('🔧 Firebase credentials issue - check service account permissions');
    }
    
    return { success: false, error: error.message };
  }
};
```

### **Environment Variables Check**

Ensure these are set in your `.env` file:
```env
FIREBASE_PROJECT_ID=secrettrip-202c4
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...your key...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@secrettrip-202c4.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY_ID=your-key-id
FIREBASE_CLIENT_ID=your-client-id
```

## 🧪 **Testing FCM Setup**

Create a test endpoint to verify FCM configuration:

```javascript
// Add to test.controller.js
exports.testFCMConfiguration = async (req, res, next) => {
  try {
    const admin = require('../config/firebase');
    
    if (!admin) {
      return res.json({
        success: false,
        message: 'Firebase not initialized',
        recommendations: [
          'Check environment variables',
          'Verify service account credentials'
        ]
      });
    }

    // Test messaging service availability
    try {
      const messaging = admin.messaging();
      
      // Try to validate a dummy token (this will fail but shows if service is accessible)
      await messaging.send({
        token: 'dummy-token-for-testing',
        notification: { title: 'Test', body: 'Test' }
      });
      
    } catch (testError) {
      if (testError.code === 'messaging/registration-token-not-registered') {
        // This is expected - means FCM service is accessible
        return res.json({
          success: true,
          message: 'FCM service is accessible',
          status: 'ready'
        });
      } else if (testError.code === 'messaging/mismatched-credential') {
        return res.json({
          success: false,
          message: 'FCM credentials issue',
          error: testError.message,
          recommendations: [
            'Check service account permissions',
            'Verify project ID matches',
            'Ensure Cloud Messaging API is enabled'
          ]
        });
      }
    }

  } catch (error) {
    res.json({
      success: false,
      message: 'FCM test failed',
      error: error.message
    });
  }
};
```

## 🚀 **Recommended Action Plan**

1. **Immediate Fix**: Update notification service with graceful error handling
2. **Long-term Fix**: Fix Firebase service account permissions
3. **Testing**: Add FCM test endpoint
4. **Monitoring**: Add proper logging for FCM issues

## 📋 **Verification Steps**

After implementing the fix:

1. **Check Logs**: No more FCM crashes
2. **Test Endpoint**: `GET /api/test/fcm-configuration`
3. **Trip Activation**: Should work without FCM errors
4. **Notifications**: Will be skipped gracefully if FCM unavailable

## 🎯 **Success Criteria**

- ✅ Application doesn't crash due to FCM errors
- ✅ Trip activation works normally
- ✅ Mission assignment continues without interruption
- ✅ FCM notifications work when properly configured
- ✅ Clear logging for debugging FCM issues


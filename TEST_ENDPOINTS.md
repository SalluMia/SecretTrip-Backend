# Test Endpoints for File Upload Optimization

This document describes the test endpoints created to verify the optimized file upload and overwrite functionality.

## 🚀 Available Test Endpoints

All endpoints require authentication. Base URL: `http://localhost:5000/api/test`

### 1. Test PDF Generation
```
GET /test/pdf-generation/:tripId?quality=standard|hd
```
**Purpose**: Test PDF generation for trip albums and verify storage
**Response**: PDF generation details, file existence, and mission data

### 2. Test File Overwrite (Profile Photos)
```
POST /test/file-overwrite?fileType=profile
Content-Type: multipart/form-data
Body: profilePhoto (file)
```
**Purpose**: Test profile photo overwrite functionality
**Response**: Upload result and overwrite behavior details

### 3. Test Mission Photo Overwrite
```
POST /test/mission-overwrite/:missionId
Content-Type: multipart/form-data
Body: missionPhoto (file), isRetake=true
```
**Purpose**: Test mission photo retake/overwrite functionality
**Response**: Upload result and old file deletion details

### 4. Test Scaleway Operations
```
GET /test/scaleway-operations
```
**Purpose**: Test basic Scaleway storage operations (upload, exists, delete)
**Response**: Test results for all storage operations

### 5. Test Album Service
```
GET /test/album-service/:tripId
```
**Purpose**: Test album service functions (directory check, photo diagnosis)
**Response**: Album service test results and photo analysis

### 6. Create Test PDF
```
POST /test/create-pdf
```
**Purpose**: Create and upload a simple test PDF to verify PDF handling
**Response**: PDF creation and upload results

## 🧪 Testing Scenarios

### Profile Photo Overwrite Test
1. Upload initial profile photo via `/api/profile/complete-profile`
2. Use test endpoint to upload another photo: `POST /test/file-overwrite?fileType=profile`
3. Verify old photo was deleted and new photo is stored with same filename pattern

### Mission Photo Retake Test
1. Submit initial mission photo via `/api/missions/:missionId/submit`
2. Use test endpoint for retake: `POST /test/mission-overwrite/:missionId`
3. Verify old photo and thumbnail were deleted and new ones uploaded

### PDF Generation Test
1. Ensure trip has completed missions with photos
2. Test PDF generation: `GET /test/pdf-generation/:tripId`
3. Verify PDF is created and stored in Scaleway

### Album Overwrite Test
1. Generate initial album for a trip
2. Regenerate album (should overwrite old PDF)
3. Verify old PDF was deleted and new one created

## 📋 Expected Behavior

### ✅ Optimized Overwrite Logic

1. **Profile Photos**: 
   - Create: No deletion check (new user)
   - Update: Delete old photo before uploading new one

2. **Mission Photos**:
   - Submit: No deletion check (new submission)
   - Retake: Delete old photo and thumbnail before uploading new ones

3. **Album PDFs**:
   - Generate: Delete old PDF of same quality before creating new one
   - Different qualities (standard/HD) are stored separately

### 🔍 Verification Points

- Old files are properly deleted from Scaleway
- New files use consistent naming patterns
- Database URLs are updated correctly
- No orphaned files remain in storage
- Error handling for missing files works correctly

## 🛠 Usage Examples

### Test Profile Photo Overwrite
```bash
# First, complete profile with photo
curl -X POST http://localhost:5000/api/profile/complete-profile \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "profilePhoto=@test-image.jpg" \
  -F "travelInterests=[1,2,3]"

# Then test overwrite
curl -X POST http://localhost:5000/api/test/file-overwrite?fileType=profile \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "profilePhoto=@new-test-image.jpg"
```

### Test PDF Generation
```bash
curl -X GET http://localhost:5000/api/test/pdf-generation/TRIP_ID?quality=standard \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Scaleway Operations
```bash
curl -X GET http://localhost:5000/api/test/scaleway-operations \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🎯 Success Criteria

- All test endpoints return 200 status
- File overwrite tests show `overwriteExpected: true` when applicable
- PDF generation creates valid files in Scaleway
- Scaleway operations test passes all sub-tests
- No linting errors in test code
- Proper error handling for edge cases

## 🚨 Important Notes

- Test endpoints are for development/testing only
- Ensure proper authentication tokens
- Test with actual trip data that has completed missions
- Monitor Scaleway storage for proper file management
- Clean up test files after testing if needed

## 🔧 Troubleshooting

If tests fail:
1. Check Scaleway credentials in environment variables
2. Verify database has proper trip and mission data
3. Ensure upload directories exist and are writable
4. Check network connectivity to Scaleway
5. Review server logs for detailed error messages

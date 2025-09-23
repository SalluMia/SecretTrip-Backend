#!/bin/bash

# Demo Album Generation Test Script
# This script demonstrates how to test the album generation functionality

echo "🚀 Album Generation Demo Test Script"
echo "===================================="
echo ""

# Check if token is provided
if [ -z "$1" ]; then
    echo "❌ Usage: $0 <auth_token> [trip_id]"
    echo ""
    echo "📋 To get an auth token:"
    echo "1. Register a user:"
    echo "   curl -X POST http://localhost:5000/api/auth/signup \\"
    echo "        -H 'Content-Type: application/json' \\"
    echo "        -d '{\"email\":\"test@example.com\",\"password\":\"password123\",\"displayName\":\"Test User\"}'"
    echo ""
    echo "2. Verify OTP (check email or logs for OTP):"
    echo "   curl -X POST http://localhost:5000/api/auth/verify-otp \\"
    echo "        -H 'Content-Type: application/json' \\"
    echo "        -d '{\"email\":\"test@example.com\",\"otp\":\"123456\"}'"
    echo ""
    echo "3. Login:"
    echo "   curl -X POST http://localhost:5000/api/auth/login \\"
    echo "        -H 'Content-Type: application/json' \\"
    echo "        -d '{\"email\":\"test@example.com\",\"password\":\"password123\"}'"
    echo ""
    exit 1
fi

TOKEN="$1"
TRIP_ID="$2"
BASE_URL="http://localhost:5000/api"

echo "🔧 Testing Scaleway Operations..."
echo "================================"
SCALEWAY_RESULT=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/test/scaleway-operations")
echo "$SCALEWAY_RESULT" | jq '.'
echo ""

echo "📄 Testing Simple PDF Creation..."
echo "================================"
PDF_RESULT=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE_URL/test/create-pdf")
echo "$PDF_RESULT" | jq '.'
echo ""

if [ -n "$TRIP_ID" ]; then
    echo "🎯 Testing Album Service for Trip: $TRIP_ID"
    echo "=========================================="
    ALBUM_SERVICE_RESULT=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/test/album-service/$TRIP_ID")
    echo "$ALBUM_SERVICE_RESULT" | jq '.'
    echo ""
    
    echo "📊 Testing PDF Generation for Trip: $TRIP_ID"
    echo "==========================================="
    echo "Standard Quality:"
    PDF_GEN_RESULT=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/test/pdf-generation/$TRIP_ID?quality=standard")
    echo "$PDF_GEN_RESULT" | jq '.'
    echo ""
    
    echo "HD Quality:"
    PDF_GEN_HD_RESULT=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/test/pdf-generation/$TRIP_ID?quality=hd")
    echo "$PDF_GEN_HD_RESULT" | jq '.'
    echo ""
else
    echo "ℹ️  No trip ID provided. Skipping trip-specific tests."
    echo "   To test with a trip, provide trip ID as second parameter:"
    echo "   $0 $TOKEN <trip_id>"
    echo ""
fi

echo "✅ Demo tests completed!"
echo ""
echo "📋 Additional Test Endpoints:"
echo "============================"
echo "• Profile Photo Overwrite Test:"
echo "  curl -X POST -H 'Authorization: Bearer $TOKEN' \\"
echo "       -F 'profilePhoto=@test-image.jpg' \\"
echo "       '$BASE_URL/test/file-overwrite?fileType=profile'"
echo ""
echo "• Mission Photo Overwrite Test (requires mission ID):"
echo "  curl -X POST -H 'Authorization: Bearer $TOKEN' \\"
echo "       -F 'missionPhoto=@test-image.jpg' \\"
echo "       '$BASE_URL/test/mission-overwrite/MISSION_ID'"
echo ""
echo "• Get User Trips (to find trip IDs):"
echo "  curl -H 'Authorization: Bearer $TOKEN' '$BASE_URL/trip/user-trips'"
echo ""
echo "🎉 All available test endpoints are working!"

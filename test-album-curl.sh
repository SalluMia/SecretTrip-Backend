#!/bin/bash

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
echo "curl -H \"Authorization: Bearer $TOKEN\" \"$BASE_URL/test/pdf-generation/TRIP_ID\""

# Secret Trip Backend API Documentation

## 🔐 Authentication

All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## 💳 Payment Endpoints

### 1. Create Payment Intent (Unified Endpoint)

**Endpoint:** `POST /api/payments/unified`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "tripId": "b5bbaa04-2724-4bb4-badc-ec7013d5c0cf",
  "albumId": "930c8a4b-d546-4784-92d4-152dd99d6b22",
  "amount": "299",
  "paymentType": "hd-album"
}
```

**Parameters:**
- `tripId` (string, required): The trip ID
- `albumId` (string, required): The album ID
- `amount` (string, required): Amount in cents (e.g., "299" for €2.99)
- `paymentType` (string, optional): "hd-album" or "direct" (default: "hd-album")

**Success Response (200):**
```json
{
  "success": true,
  "message": "Payment intent created",
  "data": {
    "paymentIntentId": "pi_3RoROMDlsTa0rvBq4bfbRIUb",
    "clientSecret": "pi_3RoROMDlsTa0rvBq4bfbRIUb_secret_xxx",
    "amount": 299,
    "currency": "eur",
    "paymentId": "9930ff2e-b27f-4d6e-8f73-b73da44d4ce2"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "Trip ID and Album ID are required",
  "statusCode": 400
}
```

---

### 2. Handle Payment Success

**Endpoint:** `POST /api/payments/success`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "paymentIntentId": "pi_3RoROMDlsTa0rvBq4bfbRIUb",
  "tripId": "b5bbaa04-2724-4bb4-badc-ec7013d5c0cf",
  "albumId": "930c8a4b-d546-4784-92d4-152dd99d6b22",
  "amount": 299
}
```

**Parameters:**
- `paymentIntentId` (string, required): Stripe payment intent ID
- `tripId` (string, required): The trip ID
- `albumId` (string, required): The album ID
- `amount` (number, required): Amount in cents

**Success Response (200):**
```json
{
  "success": true,
  "message": "Payment processed successfully",
  "data": {
    "success": true,
    "hdPdfUrl": "https://example.com/hd-album.pdf",
    "message": "HD album unlocked for all trip members",
    "paymentId": "9930ff2e-b27f-4d6e-8f73-b73da44d4ce2",
    "paymentStatus": "completed",
    "tripName": "Paris Adventure X2",
    "purchaserName": "John Doe",
    "memberCount": 5,
    "hdAccess": true
  }
}
```

---

### 3. Check HD Access Status

**Endpoint:** `GET /api/payments/hd-access/{tripId}`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**URL Parameters:**
- `tripId` (string, required): The trip ID

**Success Response (200):**
```json
{
  "success": true,
  "message": "HD access checked",
  "data": {
    "hasHDAccess": true,
    "hdPdfUrl": "https://example.com/hd-album.pdf",
    "albumId": "930c8a4b-d546-4784-92d4-152dd99d6b22"
  }
}
```

**No HD Access Response:**
```json
{
  "success": true,
  "message": "HD access checked",
  "data": {
    "hasHDAccess": false,
    "message": "Album not found"
  }
}
```

---

### 4. Check HD Album Availability

**Endpoint:** `GET /api/payments/hd-availability/{tripId}`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**URL Parameters:**
- `tripId` (string, required): The trip ID

**Success Response (200):**
```json
{
  "success": true,
  "message": "HD album availability checked",
  "data": {
    "available": true,
    "price": 299,
    "currency": "eur",
    "tripName": "Paris Adventure X2",
    "albumId": "930c8a4b-d546-4784-92d4-152dd99d6b22"
  }
}
```

---

### 5. Get Payment Status

**Endpoint:** `GET /api/payments/{paymentId}/status`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**URL Parameters:**
- `paymentId` (string, required): The payment ID

**Success Response (200):**
```json
{
  "success": true,
  "message": "Payment status retrieved",
  "data": {
    "paymentId": "9930ff2e-b27f-4d6e-8f73-b73da44d4ce2",
    "status": "completed",
    "amount": 299,
    "currency": "eur",
    "type": "album_hd",
    "timestamp": "2024-07-24T15:52:16.000Z"
  }
}
```

---

### 6. Get User Payment History

**Endpoint:** `GET /api/payments/history`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Payment history retrieved",
  "data": {
    "payments": [
      {
        "id": "9930ff2e-b27f-4d6e-8f73-b73da44d4ce2",
        "tripId": "b5bbaa04-2724-4bb4-badc-ec7013d5c0cf",
        "type": "album_hd",
        "amount": 299,
        "currency": "eur",
        "status": "completed",
        "timestamp": "2024-07-24T15:52:16.000Z",
        "tripName": "Paris Adventure X2"
      }
    ],
    "totalPayments": 1
  }
}
```

---

## 🚀 Flutter Integration Guide

### 1. Create Payment Intent

```dart
Future<Map<String, dynamic>> createPaymentIntent({
  required String tripId,
  required String albumId,
  required int amount,
  String paymentType = 'hd-album',
}) async {
  final response = await http.post(
    Uri.parse('$baseUrl/api/payments/unified'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    },
    body: jsonEncode({
      'tripId': tripId,
      'albumId': albumId,
      'amount': amount.toString(),
      'paymentType': paymentType,
    }),
  );

  return jsonDecode(response.body);
}
```

### 2. Handle Payment Success

```dart
Future<Map<String, dynamic>> handlePaymentSuccess({
  required String paymentIntentId,
  required String tripId,
  required String albumId,
  required int amount,
}) async {
  final response = await http.post(
    Uri.parse('$baseUrl/api/payments/success'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    },
    body: jsonEncode({
      'paymentIntentId': paymentIntentId,
      'tripId': tripId,
      'albumId': albumId,
      'amount': amount,
    }),
  );

  return jsonDecode(response.body);
}
```

### 3. Check HD Access

```dart
Future<Map<String, dynamic>> checkHDAccess(String tripId) async {
  final response = await http.get(
    Uri.parse('$baseUrl/api/payments/hd-access/$tripId'),
    headers: {
      'Authorization': 'Bearer $token',
    },
  );

  return jsonDecode(response.body);
}
```

### 4. Check HD Availability

```dart
Future<Map<String, dynamic>> checkHDAvailability(String tripId) async {
  final response = await http.get(
    Uri.parse('$baseUrl/api/payments/hd-availability/$tripId'),
    headers: {
      'Authorization': 'Bearer $token',
    },
  );

  return jsonDecode(response.body);
}
```

### 5. Get Payment History

```dart
Future<Map<String, dynamic>> getPaymentHistory() async {
  final response = await http.get(
    Uri.parse('$baseUrl/api/payments/history'),
    headers: {
      'Authorization': 'Bearer $token',
    },
  );

  return jsonDecode(response.body);
}
```

---

## 🔧 Error Handling

### Common Error Responses

**401 Unauthorized:**
```json
{
  "success": false,
  "message": "Unauthorized",
  "statusCode": 401
}
```

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Trip ID and Album ID are required",
  "statusCode": 400
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "Trip not found or access denied",
  "statusCode": 404
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "message": "Internal server error",
  "statusCode": 500
}
```

---

## 📱 Flutter Payment Flow Example

```dart
class PaymentService {
  static const String baseUrl = 'http://localhost:3000/api';
  static String? token; // Get from your auth service

  // 1. Create payment intent
  static Future<String> createPaymentIntent({
    required String tripId,
    required String albumId,
    required int amount,
  }) async {
    try {
      final response = await createPaymentIntent(
        tripId: tripId,
        albumId: albumId,
        amount: amount,
      );

      if (response['success']) {
        return response['data']['clientSecret'];
      } else {
        throw Exception(response['message']);
      }
    } catch (e) {
      throw Exception('Failed to create payment intent: $e');
    }
  }

  // 2. Process payment with Stripe
  static Future<void> processPayment({
    required String clientSecret,
    required String tripId,
    required String albumId,
    required int amount,
  }) async {
    try {
      // Use Stripe Flutter SDK to confirm payment
      final paymentResult = await Stripe.instance.confirmPayment(
        clientSecret,
        PaymentMethodParams.card(
          paymentMethodData: PaymentMethodData(),
        ),
      );

      if (paymentResult.status == PaymentIntentsStatus.Succeeded) {
        // 3. Handle payment success
        await handlePaymentSuccess(
          paymentIntentId: paymentResult.id!,
          tripId: tripId,
          albumId: albumId,
          amount: amount,
        );
      } else {
        throw Exception('Payment failed');
      }
    } catch (e) {
      throw Exception('Payment processing failed: $e');
    }
  }

  // 4. Check HD access after payment
  static Future<bool> checkHDAccess(String tripId) async {
    try {
      final response = await checkHDAccess(tripId);
      return response['success'] && response['data']['hasHDAccess'];
    } catch (e) {
      return false;
    }
  }
}
```

---

## 🎯 Test Data

Use these test IDs for development:

```json
{
  "tripId": "b5bbaa04-2724-4bb4-badc-ec7013d5c0cf",
  "albumId": "930c8a4b-d546-4784-92d4-152dd99d6b22",
  "userId": "bfc9efec-5997-4814-82f2-b00da00b6035",
  "amount": 299
}
```

---

## 📋 Summary

**Key Endpoints for Flutter:**
1. `POST /api/payments/unified` - Create payment intent
2. `POST /api/payments/success` - Handle payment success
3. `GET /api/payments/hd-access/{tripId}` - Check HD access
4. `GET /api/payments/hd-availability/{tripId}` - Check availability
5. `GET /api/payments/history` - Get payment history

**Required Headers:**
- `Authorization: Bearer <jwt_token>`
- `Content-Type: application/json` (for POST requests)

**Payment Flow:**
1. Create payment intent → Get `clientSecret`
2. Process payment with Stripe Flutter SDK
3. Handle payment success → Update database
4. Check HD access → Display to user 
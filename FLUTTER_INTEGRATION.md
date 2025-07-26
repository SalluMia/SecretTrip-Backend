# Flutter Payment Integration Guide

## Overview
This guide explains how to integrate the Secret Trip payment system with Flutter apps. The backend has been modified to support both React (web) and Flutter (mobile) clients through a unified payment endpoint.

## Key Changes Made

### 1. Unified Payment Endpoint
- **Endpoint**: `POST /api/payments/unified`
- **Platform Support**: Both React (web) and Flutter (mobile)
- **Platform Detection**: Use `platform: 'mobile'` in request body

### 2. Flutter-Specific Methods Added
- `createHDAlbumPaymentIntentForMobile()` - Creates payment intent for Flutter
- `processDirectPaymentForMobile()` - Handles direct payments for Flutter
- `getFlutterIntegrationGuide()` - Provides integration documentation

## API Usage

### Step 1: Create Payment Intent
```dart
// Flutter code
final response = await http.post(
  Uri.parse('${baseUrl}/api/payments/unified'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'tripId': tripId,
    'albumId': albumId,
    'amount': 299, // €2.99 in cents
    'paymentType': 'hd-album',
    'platform': 'mobile' // Important for Flutter
  }),
);

final paymentData = jsonDecode(response.body)['data'];
final clientSecret = paymentData['clientSecret'];
```

### Step 2: Confirm Payment with Stripe SDK
```dart
try {
  await Stripe.instance.confirmPayment(
    clientSecret,
    PaymentMethodParams.card(
      paymentMethodData: PaymentMethodData(
        billingDetails: billingDetails,
      ),
    ),
  );
  
  // Step 3: Notify backend of success
  await http.post(
    Uri.parse('${baseUrl}/api/payments/unified'),
    headers: {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({
      'tripId': tripId,
      'albumId': albumId,
      'amount': 299,
      'paymentIntentId': paymentData['paymentIntentId'],
      'isSuccess': true
    }),
  );
  
  print('Payment successful!');
} catch (e) {
  print('Payment failed: $e');
}
```

## Response Format

### Payment Intent Creation Response
```json
{
  "success": true,
  "message": "Payment intent created",
  "data": {
    "paymentIntentId": "pi_1234567890",
    "clientSecret": "pi_1234567890_secret_abc123",
    "amount": 299,
    "currency": "eur",
    "paymentId": "uuid",
    "platform": "mobile",
    "paymentType": "hd-album",
    "instructions": {
      "nextStep": "Use client_secret with Stripe SDK to confirm payment",
      "sdkMethod": "Stripe.instance.confirmPayment(clientSecret, paymentMethodParams)"
    }
  }
}
```

## Flutter Dependencies

Add to `pubspec.yaml`:
```yaml
dependencies:
  flutter_stripe: ^10.0.0
  http: ^1.1.0
```

## Setup

### 1. Initialize Stripe
```dart
// main.dart
import 'package:flutter_stripe/flutter_stripe.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  Stripe.publishableKey = 'pk_test_your_publishable_key';
  runApp(MyApp());
}
```

### 2. Payment Service Class
```dart
class PaymentService {
  static const String baseUrl = 'https://your-backend-url.com/api';
  
  static Future<Map<String, dynamic>> createPaymentIntent({
    required String tripId,
    required String albumId,
    required int amount,
    required String token,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/payments/unified'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'tripId': tripId,
        'albumId': albumId,
        'amount': amount,
        'paymentType': 'hd-album',
        'platform': 'mobile'
      }),
    );
    
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['data'];
    } else {
      throw Exception('Failed to create payment intent');
    }
  }
  
  static Future<void> confirmPayment({
    required String clientSecret,
    required BillingDetails billingDetails,
  }) async {
    await Stripe.instance.confirmPayment(
      clientSecret,
      PaymentMethodParams.card(
        paymentMethodData: PaymentMethodData(
          billingDetails: billingDetails,
        ),
      ),
    );
  }
  
  static Future<void> notifyPaymentSuccess({
    required String tripId,
    required String albumId,
    required int amount,
    required String paymentIntentId,
    required String token,
  }) async {
    await http.post(
      Uri.parse('$baseUrl/payments/unified'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'tripId': tripId,
        'albumId': albumId,
        'amount': amount,
        'paymentIntentId': paymentIntentId,
        'isSuccess': true
      }),
    );
  }
}
```

## Error Handling

```dart
try {
  // Payment flow
} catch (e) {
  if (e is StripeException) {
    switch (e.error.code) {
      case 'card_declined':
        // Handle card declined
        break;
      case 'insufficient_funds':
        // Handle insufficient funds
        break;
      default:
        // Handle other errors
        break;
    }
  }
}
```

## Best Practices

1. **Always create payment intent on backend** - Never create on client-side
2. **Use client_secret with Stripe SDK** - For payment confirmation
3. **Notify backend after successful payment** - To update records
4. **Handle payment errors gracefully** - Provide user feedback
5. **Store payment records in backend** - For tracking and analytics
6. **Use proper error handling** - For network requests

## Security Notes

1. **Never expose Stripe secret key** - Keep it on backend only
2. **Always validate payment on backend** - Don't trust client-side validation
3. **Use HTTPS for all API calls** - Secure communication
4. **Implement proper authentication** - Protect payment endpoints

## Testing

### Test Card Numbers
- **Success**: `4242424242424242`
- **Decline**: `4000000000000002`
- **Insufficient Funds**: `4000000000009995`

### Test Environment
- Use `pk_test_` keys for testing
- Use `pk_live_` keys for production

## API Documentation

Get complete integration guide:
```
GET /api/payments/flutter-guide
```

This endpoint provides detailed documentation including:
- Complete API reference
- Code examples
- Error handling
- Best practices
- Security guidelines

## Migration from Client-Side Intent Creation

If you were previously creating payment intents on the client-side:

### Before (❌ Don't do this)
```dart
// Client-side intent creation (not recommended)
final paymentIntent = await Stripe.instance.createPaymentMethod(
  params: PaymentMethodParams.card(
    paymentMethodData: PaymentMethodData(),
  ),
);
```

### After (✅ Do this)
```dart
// Backend intent creation (recommended)
final paymentData = await PaymentService.createPaymentIntent(
  tripId: tripId,
  albumId: albumId,
  amount: 299,
  token: userToken,
);

await Stripe.instance.confirmPayment(
  paymentData['clientSecret'],
  PaymentMethodParams.card(
    paymentMethodData: PaymentMethodData(),
  ),
);
```

## Support

For questions or issues:
1. Check the API documentation at `/api/payments/flutter-guide`
2. Review server logs for detailed error messages
3. Ensure all required fields are provided in requests
4. Verify authentication tokens are valid 
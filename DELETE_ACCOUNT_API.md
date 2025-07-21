# Delete Account API

## Overview
The delete account functionality allows users to permanently delete their account and all associated data from the system.

## Endpoint
```
DELETE /api/auth/account
```

## Authentication
This endpoint requires authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Request Body
```json
{
  "password": "user-password",
  "confirmPassword": "user-password"
}
```

### Required Fields
- `password`: The user's current password
- `confirmPassword`: Confirmation of the password (must match password)

## Response

### Success Response (200)
```json
{
  "success": true,
  "message": "Account deleted successfully",
  "data": {
    "message": "Account and all associated data deleted successfully",
    "userId": "user-uuid"
  }
}
```

### Error Responses

#### 400 - Bad Request
```json
{
  "success": false,
  "message": "Password is required to delete account"
}
```

```json
{
  "success": false,
  "message": "Please confirm your password"
}
```

```json
{
  "success": false,
  "message": "Passwords do not match"
}
```

#### 401 - Unauthorized
```json
{
  "success": false,
  "message": "Token missing"
}
```

```json
{
  "success": false,
  "message": "Invalid token"
}
```

#### 500 - Server Error
```json
{
  "success": false,
  "message": "User not found"
}
```

```json
{
  "success": false,
  "message": "Cannot delete account: No password set (Google OAuth user)"
}
```

```json
{
  "success": false,
  "message": "Invalid password"
}
```

## Data Deletion Process

When a user deletes their account, the following data is permanently removed:

### User-Related Data
- User profile information
- Email verification tokens
- Password reset tokens
- FCM tokens
- Notification preferences

### Trip-Related Data
- All trips created by the user (including all associated data)
- All trips the user joined as a member
- All assigned missions for the user
- All trip aliases created by the user
- All join requests made by the user

### Financial Data
- All payment records associated with the user

### Notification Data
- All notification history for the user

### Travel Interests
- All travel interest associations for the user

## Security Features

1. **Password Verification**: Users must provide their current password to delete their account
2. **Password Confirmation**: Users must confirm their password to prevent accidental deletion
3. **Transaction Safety**: All deletions are performed within a database transaction to ensure data consistency
4. **Google OAuth Protection**: Google OAuth users cannot delete their account through this endpoint (they should use Google's account deletion)

## Usage Example

```javascript
// Using fetch
const response = await fetch('/api/auth/account', {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    password: 'user-password',
    confirmPassword: 'user-password'
  })
});

const result = await response.json();
```

## Important Notes

1. **Irreversible Action**: Account deletion is permanent and cannot be undone
2. **Data Loss**: All user data, including trips, missions, and payments, will be permanently deleted
3. **Google OAuth Users**: Users who signed up with Google OAuth cannot use this endpoint as they don't have a password set
4. **Trip Impact**: If a user created trips, those trips and all associated data will be deleted
5. **Member Impact**: If a user was a member of trips created by others, they will be removed from those trips

## Error Handling

The API includes comprehensive error handling for:
- Missing or invalid authentication tokens
- Missing or mismatched passwords
- Non-existent users
- Google OAuth users without passwords
- Database transaction failures 
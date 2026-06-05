# Razorpay Subscription Integration

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install razorpay
   ```

2. **Configure Environment Variables**
   Add to `.env`:
   ```
   RAZORPAY_KEY_ID=your_razorpay_key_id
   RAZORPAY_KEY_SECRET=your_razorpay_key_secret
   ```

   Get these from your Razorpay Dashboard:
   - [Razorpay Dashboard](https://dashboard.razorpay.com/)
   - Settings → API Keys → Key ID and Key Secret

3. **Database Fields**
   - `Subscription` model stores all payment transaction details
   - `UserProfile` updated with `isPremium` and `premiumSubscriptionEndDate` fields

## API Endpoints

### 1. Create Monthly Subscription Order
**Endpoint:** `POST /user/subscription/create-order/monthly`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Monthly subscription order created",
  "order": {
    "id": "order_HO2jc...",
    "amount": 9900,
    "currency": "INR",
    "status": "created"
  },
  "subscriptionId": "subscription_mongo_id"
}
```

**Plan Details:**
- **Amount:** ₹99 (9900 paise)
- **Duration:** 1 Month
- **Renewal:** Manual

---

### 2. Create Yearly Subscription Order
**Endpoint:** `POST /user/subscription/create-order/yearly`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Yearly subscription order created",
  "order": {
    "id": "order_HO2jc...",
    "amount": 99900,
    "currency": "INR",
    "status": "created"
  },
  "subscriptionId": "subscription_mongo_id"
}
```

**Plan Details:**
- **Amount:** ₹999 (99900 paise)
- **Duration:** 1 Year
- **Renewal:** Manual

---

### 3. Verify Payment & Activate Subscription
**Endpoint:** `POST /user/subscription/verify-payment`

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "razorpayOrderId": "order_HO2jc...",
  "razorpayPaymentId": "pay_HO2jc...",
  "razorpaySignature": "9ef4d..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment verified and subscription activated",
  "subscription": {
    "_id": "subscription_id",
    "planType": "monthly",
    "amount": 9900,
    "status": "completed",
    "isActive": true,
    "subscriptionStartDate": "2024-01-15T10:30:00Z",
    "subscriptionEndDate": "2024-02-15T10:30:00Z"
  }
}
```

---

### 4. Get Subscription Status
**Endpoint:** `GET /user/subscription/status`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (Active Subscription):**
```json
{
  "success": true,
  "message": "Active subscription found",
  "subscription": {
    "_id": "subscription_id",
    "planType": "monthly",
    "status": "completed",
    "isActive": true,
    "subscriptionEndDate": "2024-02-15T10:30:00Z",
    "daysRemaining": 28
  },
  "isSubscribed": true,
  "daysRemaining": 28
}
```

**Response (No Active Subscription):**
```json
{
  "success": true,
  "message": "No active subscription found",
  "subscription": null,
  "isSubscribed": false
}
```

---

### 5. Cancel Subscription
**Endpoint:** `POST /user/subscription/cancel`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription cancelled successfully",
  "subscription": {
    "_id": "subscription_id",
    "status": "cancelled",
    "isActive": false
  }
}
```

---

## Frontend Integration Example

### 1. Create Order
```javascript
const createSubscriptionOrder = async (planType) => {
  const response = await fetch(`/user/subscription/create-order/${planType}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  return data.order;
};
```

### 2. Handle Razorpay Payment
```javascript
const handlePayment = async (planType) => {
  const order = await createSubscriptionOrder(planType);
  
  const options = {
    key: process.env.REACT_APP_RAZORPAY_KEY_ID,
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    name: "Chat App Premium",
    description: `${planType.charAt(0).toUpperCase() + planType.slice(1)} Subscription`,
    handler: async (response) => {
      // Verify payment on backend
      const verifyResponse = await fetch('/user/subscription/verify-payment', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature
        })
      });
      
      const data = await verifyResponse.json();
      if (data.success) {
        // Subscription activated
        console.log('Subscription activated!');
      }
    }
  };
  
  const razorpay = new window.Razorpay(options);
  razorpay.open();
};
```

### 3. Check Subscription Status
```javascript
const checkSubscriptionStatus = async () => {
  const response = await fetch('/user/subscription/status', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  return data.isSubscribed;
};
```

---

## Database Schema

### Subscription Model
```javascript
{
  userId: ObjectId,           // Reference to user
  planType: "monthly|yearly", // Subscription duration
  amount: Number,             // Amount in paise
  currency: "INR",            // Currency
  razorpayOrderId: String,    // Razorpay Order ID
  razorpayPaymentId: String,  // Razorpay Payment ID (after payment)
  razorpaySignature: String,  // Payment signature (after verification)
  status: "pending|completed|failed|cancelled",
  subscriptionStartDate: Date,
  subscriptionEndDate: Date,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

---

## Error Handling

### Common Error Responses

**Invalid Signature:**
```json
{
  "success": false,
  "message": "Invalid payment signature"
}
```

**Missing Payment Details:**
```json
{
  "success": false,
  "message": "Missing required payment details"
}
```

**Subscription Not Found:**
```json
{
  "success": false,
  "message": "Subscription not found"
}
```

---

## Testing with Razorpay Test Keys

Use test credentials from Razorpay Dashboard in test mode:

**Test Card Details:**
- Card Number: `4111111111111111`
- CVV: Any 3 digits
- Expiry: Any future date

---

## Notes

- Subscription automatically expires after the specified duration
- Payment signature verification is mandatory for security
- User profile is updated with `isPremium` status upon successful payment
- Expired subscriptions are automatically marked inactive

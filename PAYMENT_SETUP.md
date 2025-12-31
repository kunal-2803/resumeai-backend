# Cashfree Payment Integration Setup

This document explains how to set up Cashfree payment integration for the Resume AI application.

## Environment Variables

Add the following environment variables to your `.env` file in the `backend` directory:

```env
# Cashfree Configuration
CASHFREE_APP_ID=your_cashfree_app_id
CASHFREE_SECRET_KEY=your_cashfree_secret_key
CASHFREE_ENV=sandbox  # Use 'sandbox' for test environment, 'production' for live

# Backend URL (for webhook callbacks)
BACKEND_URL=http://localhost:3000  # Update with your production URL

# Frontend URL (for payment redirects)
FRONTEND_URL=http://localhost:5173  # Update with your production URL
```

## Frontend Environment Variables

Add the following to your frontend `.env` file (in `resume-revive` directory):

```env
# API Base URL
VITE_API_BASE_URL=http://localhost:3000/api

# Cashfree Environment
VITE_CASHFREE_ENV=sandbox  # Use 'sandbox' for test environment, 'production' for live
```

## Getting Cashfree Credentials

1. Sign up for a Cashfree account at https://www.cashfree.com/
2. Navigate to the Developer section in your dashboard
3. Create a new app or use an existing one
4. Copy your App ID and Secret Key
5. For test environment, use the sandbox credentials
6. For production, use the production credentials

## Webhook Configuration

1. In your Cashfree dashboard, go to Webhooks section
2. Add a webhook URL: `https://your-backend-url.com/api/payment/webhook`
3. Select the following events:
   - `PAYMENT_SUCCESS`
   - `PAYMENT_FAILED`
   - `PAYMENT_USER_DROPPED`

## Testing

### Test Cards (Sandbox Environment)

For testing card payments:
- Card Number: `4111 1111 1111 1111`
- CVV: Any 3 digits
- Expiry: Any future date
- Name: Any name

### Test UPI (Sandbox Environment)

For testing UPI payments:
- Use any UPI ID (e.g., `success@upi`)
- The payment will be automatically successful in sandbox mode

## Payment Flow

1. User clicks "Upgrade Plan" on the Plans page
2. Frontend calls `POST /api/payment/create-order` with `planId`
3. Backend creates an order in Cashfree and returns `orderId` and `paymentSessionId`
4. Frontend opens Cashfree checkout using the payment session ID
5. User completes payment via UPI or Card
6. Cashfree sends webhook to `POST /api/payment/webhook`
7. Backend updates order status and user subscription in MongoDB
8. User is redirected back to the Plans page with payment status

## Database Collections

The integration creates/updates the following collections:

- **orders**: Stores order details and transaction information
  - Fields: `userId`, `planId`, `orderId`, `paymentSessionId`, `amount`, `currency`, `status`, `transactionDetails`

## Troubleshooting

### Webhook Not Receiving Events

1. Ensure your backend URL is publicly accessible (use ngrok for local testing)
2. Check webhook URL configuration in Cashfree dashboard
3. Verify webhook events are enabled for your app
4. Check backend logs for webhook requests

### Payment Not Processing

1. Verify Cashfree credentials are correct
2. Check that `CASHFREE_ENV` matches your credentials (sandbox vs production)
3. Ensure the plan price is greater than 0 (free plans don't require payment)
4. Check browser console for Cashfree SDK errors

### Order Status Not Updating

1. Verify webhook is being received (check backend logs)
2. Ensure MongoDB connection is working
3. Check that subscription service is updating correctly
4. Verify order exists in database before webhook processing

## Production Checklist

Before going live:

- [ ] Switch `CASHFREE_ENV` to `production`
- [ ] Update `BACKEND_URL` to production URL
- [ ] Update `FRONTEND_URL` to production URL
- [ ] Configure production webhook URL in Cashfree dashboard
- [ ] Test complete payment flow in production
- [ ] Verify webhook signature validation (add if needed)
- [ ] Set up monitoring for payment failures
- [ ] Configure error alerts


const paypalBaseUrl = process.env.PAYPAL_ENV === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

const appBaseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:8787";
const clientBaseUrl = process.env.CLIENT_BASE_URL || "http://127.0.0.1:5173";

const getAccessToken = async () => {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`PayPal OAuth failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
};

export const paypalIsConfigured = () =>
  Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

export const createPayPalOrder = async ({ order, total }) => {
  if (!paypalIsConfigured()) {
    return {
      paypalOrderId: `sandbox-${order.id}`,
      approvalUrl: null,
      sandboxMode: true,
    };
  }

  const token = await getAccessToken();
  const response = await fetch(`${paypalBaseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: order.id,
          custom_id: order.id,
          invoice_id: order.id,
          amount: {
            currency_code: "BRL",
            value: total.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "ARCADE.CO",
        landing_page: "LOGIN",
        user_action: "PAY_NOW",
        return_url: `${appBaseUrl}/api/paypal/return`,
        cancel_url: `${clientBaseUrl}/#conta`,
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal create order failed: ${response.status} ${details}`);
  }

  const data = await response.json();
  const approvalUrl = data.links?.find((link) => link.rel === "approve")?.href;

  return {
    paypalOrderId: data.id,
    approvalUrl,
    sandboxMode: false,
  };
};

export const capturePayPalOrder = async (paypalOrderId) => {
  if (!paypalIsConfigured()) {
    return { status: "COMPLETED", sandboxMode: true };
  }

  const token = await getAccessToken();
  const response = await fetch(`${paypalBaseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal capture failed: ${response.status} ${details}`);
  }

  return response.json();
};

export const verifyPayPalWebhook = async ({ headers, body }) => {
  if (!paypalIsConfigured() || !process.env.PAYPAL_WEBHOOK_ID) {
    return false;
  }

  const token = await getAccessToken();
  const response = await fetch(`${paypalBaseUrl}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: body,
    }),
  });

  if (!response.ok) return false;
  const data = await response.json();
  return data.verification_status === "SUCCESS";
};

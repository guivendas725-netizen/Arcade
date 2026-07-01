const mercadoPagoBaseUrl = "https://api.mercadopago.com";

const mercadoPagoHeaders = (extra = {}) => ({
  Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
  "Content-Type": "application/json",
  ...extra,
});

export const mercadoPagoIsConfigured = () => Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN);

export const createPixPayment = async ({ order, total }) => {
  if (!mercadoPagoIsConfigured()) {
    throw new Error("Mercado Pago nao configurado.");
  }

  const [firstName, ...lastName] = String(order.userName || "Cliente").split(" ");
  const appBaseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:8787";

  const response = await fetch(`${mercadoPagoBaseUrl}/v1/payments`, {
    method: "POST",
    headers: mercadoPagoHeaders({ "X-Idempotency-Key": order.id }),
    body: JSON.stringify({
      transaction_amount: Number(Number(total).toFixed(2)),
      description: `Pedido ${order.id} ARCADE.CO`,
      payment_method_id: "pix",
      external_reference: order.id,
      notification_url: `${appBaseUrl}/api/mercadopago/webhook`,
      payer: {
        email: order.userEmail,
        first_name: firstName,
        last_name: lastName.join(" "),
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || "Nao foi possivel criar o Pix.");
  }

  const transactionData = data.point_of_interaction?.transaction_data || {};
  return {
    id: data.id,
    status: data.status,
    qrCode: transactionData.qr_code,
    qrCodeBase64: transactionData.qr_code_base64,
    ticketUrl: transactionData.ticket_url,
    raw: data,
  };
};

export const getMercadoPagoPayment = async (paymentId) => {
  if (!mercadoPagoIsConfigured()) {
    throw new Error("Mercado Pago nao configurado.");
  }

  const response = await fetch(`${mercadoPagoBaseUrl}/v1/payments/${paymentId}`, {
    headers: mercadoPagoHeaders(),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || "Nao foi possivel consultar o pagamento.");
  }

  return data;
};

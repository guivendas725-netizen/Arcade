import cors from "cors";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import "dotenv/config";
import express from "express";
import { createPixPayment, getMercadoPagoPayment, mercadoPagoIsConfigured } from "./mercadopago.js";
import { capturePayPalOrder, createPayPalOrder, verifyPayPalWebhook } from "./paypal.js";
import {
  findOrderById,
  findOrderByMercadoPagoPaymentId,
  findOrderByPayPalId,
  readOrders,
  saveOrder,
  updateOrder,
} from "./storage.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const clientBaseUrl = process.env.CLIENT_BASE_URL || "http://127.0.0.1:5173";
const allowedOrigins = new Set([
  clientBaseUrl,
  process.env.APP_BASE_URL,
  "https://www.arcadecoficial.com.br",
  "https://arcadecoficial.com.br",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://localhost:5173",
  "http://localhost:5174",
].filter(Boolean));
const ownerEmail = process.env.OWNER_EMAIL || "arcadecooficial@gmail.com";
const ownerPassword = process.env.OWNER_PASSWORD || "";
const adminSessionSecret = process.env.ADMIN_SESSION_SECRET || "arcade-dev-session-change-me";

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origem nao permitida pelo CORS."));
  },
}));
app.use(express.json({ limit: "1mb" }));

const makeOrderId = () => `ARC-${Date.now().toString().slice(-6)}`;

const calculateTotal = (items = []) =>
  items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);

const paidStatus = "Pagamento confirmado";
const orderStatuses = ["Aguardando pagamento", paidStatus, "Em producao", "Enviado", "Entregue"];

const publicOrder = (order) => ({
  id: order.id,
  userEmail: order.userEmail,
  userName: order.userName,
  userPhone: order.userPhone,
  userAddress: order.userAddress,
  userDelivery: order.userDelivery,
  paymentMethod: order.paymentMethod,
  paymentStatus: order.paymentStatus,
  status: order.status,
  total: order.total,
  items: order.items,
  createdAt: order.createdAt,
  paidAt: order.paidAt,
});

const safeEqual = (left = "", right = "") => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const signPayload = (payload) =>
  createHmac("sha256", adminSessionSecret).update(payload).digest("base64url");

const createAdminToken = () => {
  const payload = Buffer.from(JSON.stringify({
    role: "owner",
    exp: Date.now() + 1000 * 60 * 60 * 8,
    nonce: randomUUID(),
  })).toString("base64url");

  return `${payload}.${signPayload(payload)}`;
};

const verifyAdminToken = (token = "") => {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, signPayload(payload))) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.role === "owner" && Number(parsed.exp) > Date.now();
  } catch {
    return false;
  }
};

const requireAdmin = (request, response, next) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!verifyAdminToken(token)) {
    return response.status(401).json({ error: "Acesso do lojista expirado ou invalido." });
  }
  return next();
};

const markPaid = async (order, paymentPayload = {}) =>
  updateOrder(order.id, () => ({
    status: paidStatus,
    paymentStatus: "CONFIRMED",
    paidAt: new Date().toISOString(),
    paymentPayload,
  }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "arcade-api" });
});

app.post("/api/admin/login", (request, response) => {
  const { email, password } = request.body;
  if (!ownerPassword || !safeEqual(String(email || "").trim().toLowerCase(), ownerEmail.toLowerCase()) || !safeEqual(password, ownerPassword)) {
    return response.status(401).json({ error: "Login ou senha incorretos." });
  }

  return response.json({ token: createAdminToken() });
});

app.get("/api/admin/orders", requireAdmin, async (_request, response) => {
  response.json(await readOrders());
});

app.get("/api/orders", async (request, response) => {
  const email = String(request.query.email || "").trim().toLowerCase();
  if (!email) {
    return response.status(400).json({ error: "Informe o e-mail da conta para consultar pedidos." });
  }

  const orders = await readOrders();
  response.json(
    orders
      .filter((order) => order.userEmail?.toLowerCase() === email)
      .map(publicOrder)
  );
});

app.post("/api/orders", async (request, response) => {
  try {
    const { customer, delivery, paymentMethod, items } = request.body;

    if (!customer?.email || !customer?.name || !customer?.phone || !items?.length) {
      return response.status(400).json({ error: "Dados do cliente ou sacola incompletos." });
    }

    const order = {
      id: makeOrderId(),
      userEmail: customer.email,
      userName: customer.name,
      userPhone: customer.phone,
      userAddress: customer.address,
      userDelivery: delivery,
      paymentMethod,
      paymentStatus: paymentMethod === "PayPal" ? "WAITING_PAYPAL" : paymentMethod === "PIX" ? "WAITING_PIX" : "WAITING_MANUAL_CONFIRMATION",
      status: "Aguardando pagamento",
      total: calculateTotal(items),
      items,
      createdAt: new Date().toISOString(),
    };

    if (paymentMethod === "PayPal") {
      const paypal = await createPayPalOrder({ order, total: order.total });
      order.paypalOrderId = paypal.paypalOrderId;
      order.paypalSandboxMode = paypal.sandboxMode;
      await saveOrder(order);
      return response.status(201).json({
        order,
        approvalUrl: paypal.approvalUrl,
        message: paypal.approvalUrl
          ? "Pedido criado. Redirecione o cliente para o PayPal."
          : "Pedido criado em modo desenvolvimento. Configure as chaves PayPal para pagamento real.",
      });
    }

    if (paymentMethod === "PIX") {
      if (!mercadoPagoIsConfigured()) {
        return response.status(503).json({
          error: "PIX automatico ainda nao configurado. Adicione MERCADO_PAGO_ACCESS_TOKEN no Render.",
        });
      }

      const pix = await createPixPayment({ order, total: order.total });
      order.mercadoPagoPaymentId = pix.id;
      order.paymentProvider = "Mercado Pago";
      order.paymentPayload = { status: pix.status };
      await saveOrder(order);
      return response.status(201).json({
        order,
        pix: {
          qrCode: pix.qrCode,
          qrCodeBase64: pix.qrCodeBase64,
          ticketUrl: pix.ticketUrl,
        },
        message: "Pedido criado. Pague o Pix para liberar a producao automaticamente.",
      });
    }

    await saveOrder(order);
    return response.status(201).json({
      order,
      message: "Pedido criado aguardando confirmacao manual do pagamento.",
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: "Nao foi possivel criar o pedido." });
  }
});

app.get("/api/paypal/return", async (request, response) => {
  try {
    const paypalOrderId = request.query.token;
    const order = await findOrderByPayPalId(paypalOrderId);

    if (!order) {
      return response.redirect(`${clientBaseUrl}/#conta?pagamento=pedido-nao-encontrado`);
    }

    const capture = await capturePayPalOrder(paypalOrderId);
    if (capture.status === "COMPLETED") {
      await markPaid(order, capture);
      return response.redirect(`${clientBaseUrl}/#conta?pagamento=confirmado`);
    }

    return response.redirect(`${clientBaseUrl}/#conta?pagamento=pendente`);
  } catch (error) {
    console.error(error);
    return response.redirect(`${clientBaseUrl}/#conta?pagamento=erro`);
  }
});

app.post("/api/paypal/webhook", async (request, response) => {
  try {
    const isVerified = await verifyPayPalWebhook({ headers: request.headers, body: request.body });
    if (!isVerified) {
      return response.status(400).json({ error: "Webhook PayPal invalido." });
    }

    const event = request.body;
    const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id || event.resource?.id;
    const order = await findOrderByPayPalId(paypalOrderId);

    if (order && event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      await markPaid(order, event);
    }

    return response.sendStatus(204);
  } catch (error) {
    console.error(error);
    return response.sendStatus(500);
  }
});

app.post("/api/mercadopago/webhook", async (request, response) => {
  try {
    const paymentId = request.body?.data?.id || request.query["data.id"] || request.query.id;
    if (!paymentId) {
      return response.sendStatus(204);
    }

    const payment = await getMercadoPagoPayment(paymentId);
    const order =
      (payment.external_reference && await findOrderById(payment.external_reference)) ||
      await findOrderByMercadoPagoPaymentId(paymentId);

    if (!order) {
      return response.sendStatus(204);
    }

    if (payment.status === "approved") {
      await markPaid(order, payment);
      return response.sendStatus(204);
    }

    await updateOrder(order.id, () => ({
      paymentStatus: String(payment.status || "WAITING_PIX").toUpperCase(),
      paymentPayload: payment,
    }));
    return response.sendStatus(204);
  } catch (error) {
    console.error(error);
    return response.sendStatus(500);
  }
});

app.patch("/api/orders/:orderId/status", requireAdmin, async (request, response) => {
  const { status } = request.body;
  const paidIndex = orderStatuses.indexOf(paidStatus);
  const selectedIndex = orderStatuses.indexOf(status);

  if (selectedIndex === -1) {
    return response.status(400).json({ error: "Status invalido." });
  }

  let blockedByPayment = false;
  const order = await updateOrder(request.params.orderId, (current) => {
    if (selectedIndex > paidIndex && current.paymentStatus !== "CONFIRMED" && current.status !== paidStatus) {
      blockedByPayment = true;
      return current;
    }

    return {
      ...current,
      status,
      paymentStatus: status === paidStatus ? "CONFIRMED" : current.paymentStatus,
      paidAt: status === paidStatus && !current.paidAt ? new Date().toISOString() : current.paidAt,
    };
  });

  if (!order) return response.status(404).json({ error: "Pedido nao encontrado." });
  if (blockedByPayment) {
    return response.status(409).json({ error: "Pagamento ainda nao confirmado." });
  }
  return response.json(order);
});

app.listen(port, () => {
  console.log(`ARCADE.CO API running on http://127.0.0.1:${port}`);
});

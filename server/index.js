import cors from "cors";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import "dotenv/config";
import express from "express";
import {
  createCardCheckoutPreference,
  createPixPayment,
  getMercadoPagoPayment,
  mercadoPagoIsConfigured,
} from "./mercadopago.js";
import { capturePayPalOrder, createPayPalOrder, verifyPayPalWebhook } from "./paypal.js";
import {
  deleteOrder,
  deleteProduct,
  findOrderById,
  findOrderByMercadoPagoPaymentId,
  findOrderByPayPalId,
  readOrders,
  readProducts,
  saveOrder,
  saveProduct,
  updateOrder,
  updateProduct,
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

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;

  try {
    const { hostname } = new URL(origin);
    return hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
};

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error("Origem nao permitida pelo CORS."));
  },
}));
app.use(express.json({ limit: "1mb" }));

const makeOrderId = () => `ARC-${Date.now().toString().slice(-6)}`;
const makeProductId = (name = "produto") =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || `produto-${Date.now()}`;

const calculateTotal = (items = []) =>
  items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);

const paidStatus = "Pagamento confirmado";
const orderStatuses = ["Aguardando pagamento", paidStatus, "Em producao", "Enviado", "Entregue"];
const paymentStatuses = ["WAITING_MANUAL_CONFIRMATION", "WAITING_PIX", "WAITING_CARD", "WAITING_PAYPAL", "CONFIRMED", "REFUNDED", "CANCELLED"];

const buildAddressFromDelivery = (delivery = {}) => {
  if (!delivery.street) return "";
  const complement = delivery.complement ? `, ${delivery.complement}` : "";
  return `${delivery.street}, ${delivery.number || "s/n"}${complement} - ${delivery.neighborhood || ""}, ${delivery.city || ""}/${delivery.state || ""}, CEP ${delivery.cep || ""}`;
};

const normalizeAdminOrderPayload = (payload = {}, currentOrder = {}) => {
  const items = Array.isArray(payload.items) && payload.items.length ? payload.items : currentOrder.items || [];
  const delivery = payload.userDelivery || currentOrder.userDelivery || {};
  const paymentMethod = payload.paymentMethod || currentOrder.paymentMethod || "PIX";
  const paymentStatus = payload.paymentStatus || currentOrder.paymentStatus || "WAITING_MANUAL_CONFIRMATION";
  const status = payload.status || currentOrder.status || "Aguardando pagamento";

  return {
    userEmail: String(payload.userEmail || currentOrder.userEmail || "").trim().toLowerCase(),
    userName: String(payload.userName || currentOrder.userName || "").trim(),
    userPhone: String(payload.userPhone || currentOrder.userPhone || "").trim(),
    userAddress: String(payload.userAddress || currentOrder.userAddress || buildAddressFromDelivery(delivery)).trim(),
    userDelivery: delivery,
    paymentMethod,
    paymentStatus,
    status,
    total: payload.total === "" || payload.total == null ? calculateTotal(items) : Number(payload.total),
    items,
    notes: String(payload.notes || currentOrder.notes || "").trim(),
  };
};

const normalizeProductPayload = (payload = {}, currentProduct = {}) => {
  const name = String(payload.name || currentProduct.name || "").trim();
  const id = String(payload.id || currentProduct.id || makeProductId(name)).trim();

  return {
    id,
    name,
    category: String(payload.category || currentProduct.category || "Camisetas").trim(),
    color: String(payload.color || currentProduct.color || "").trim(),
    tag: String(payload.tag || currentProduct.tag || "Sob encomenda").trim(),
    image: String(payload.image || currentProduct.image || "/images/polo-black.png").trim(),
    price: Number(payload.price ?? currentProduct.price ?? 0),
    oldPrice: Number(payload.oldPrice ?? currentProduct.oldPrice ?? payload.price ?? currentProduct.price ?? 0),
    description: String(payload.description || currentProduct.description || "").trim(),
    active: payload.active ?? currentProduct.active ?? true,
  };
};

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

const extractMercadoPagoPaymentId = (request) => {
  const body = request.body || {};
  const query = request.query || {};
  const resource = body.resource || query.resource;

  if (body.data?.id) return body.data.id;
  if (query["data.id"]) return query["data.id"];
  if (body.id) return body.id;
  if (query.id) return query.id;
  if (typeof resource === "string") return resource.split("/").filter(Boolean).pop();
  return "";
};

const applyMercadoPagoPayment = async (paymentId) => {
  if (!paymentId || !mercadoPagoIsConfigured()) return null;

  const payment = await getMercadoPagoPayment(paymentId);
  const order =
    (payment.external_reference && await findOrderById(payment.external_reference)) ||
    await findOrderByMercadoPagoPaymentId(paymentId);

  if (!order) return null;

  if (payment.status === "approved") {
    return markPaid(order, payment);
  }

  return updateOrder(order.id, () => ({
    mercadoPagoPaymentId: payment.id,
    paymentStatus: String(payment.status || order.paymentStatus || "WAITING_PIX").toUpperCase(),
    paymentPayload: payment,
  }));
};

const syncPendingMercadoPagoOrders = async (orders) => {
  if (!mercadoPagoIsConfigured()) return orders;

  const pendingPayments = orders.filter((order) =>
    order.mercadoPagoPaymentId && order.paymentStatus !== "CONFIRMED"
  );

  if (!pendingPayments.length) return orders;

  for (const order of pendingPayments) {
    try {
      await applyMercadoPagoPayment(order.mercadoPagoPaymentId);
    } catch (error) {
      console.error(`Nao foi possivel sincronizar pagamento ${order.mercadoPagoPaymentId}`, error);
    }
  }

  return readOrders();
};

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "arcade-api" });
});

app.get("/api/products", async (_request, response) => {
  const products = await readProducts();
  response.json(products.filter((product) => product.active !== false));
});

app.post("/api/admin/login", (request, response) => {
  const { email, password } = request.body;
  if (!ownerPassword || !safeEqual(String(email || "").trim().toLowerCase(), ownerEmail.toLowerCase()) || !safeEqual(password, ownerPassword)) {
    return response.status(401).json({ error: "Login ou senha incorretos." });
  }

  return response.json({ token: createAdminToken() });
});

app.get("/api/admin/orders", requireAdmin, async (_request, response) => {
  const orders = await syncPendingMercadoPagoOrders(await readOrders());
  response.json(orders);
});

app.get("/api/admin/products", requireAdmin, async (_request, response) => {
  response.json(await readProducts());
});

app.post("/api/admin/products", requireAdmin, async (request, response) => {
  const product = normalizeProductPayload(request.body);
  if (!product.name || !product.price || !product.image) {
    return response.status(400).json({ error: "Informe nome, preco e imagem do produto." });
  }

  const products = await readProducts();
  const uniqueId = products.some((entry) => entry.id === product.id)
    ? `${product.id}-${Date.now().toString().slice(-4)}`
    : product.id;
  const savedProduct = {
    ...product,
    id: uniqueId,
    createdAt: new Date().toISOString(),
  };

  await saveProduct(savedProduct);
  return response.status(201).json(savedProduct);
});

app.patch("/api/admin/products/:productId", requireAdmin, async (request, response) => {
  const product = await updateProduct(request.params.productId, (current) => normalizeProductPayload(request.body, current));
  if (!product) return response.status(404).json({ error: "Produto nao encontrado." });
  return response.json(product);
});

app.delete("/api/admin/products/:productId", requireAdmin, async (request, response) => {
  const product = await deleteProduct(request.params.productId);
  if (!product) return response.status(404).json({ error: "Produto nao encontrado." });
  return response.json({ ok: true, product });
});

app.post("/api/admin/orders", requireAdmin, async (request, response) => {
  const orderPayload = normalizeAdminOrderPayload(request.body);

  if (!orderPayload.userEmail || !orderPayload.userName || !orderPayload.userPhone || !orderPayload.items.length) {
    return response.status(400).json({ error: "Informe cliente, contato e pelo menos um item." });
  }

  if (!orderStatuses.includes(orderPayload.status)) {
    return response.status(400).json({ error: "Status invalido." });
  }

  if (!paymentStatuses.includes(orderPayload.paymentStatus)) {
    return response.status(400).json({ error: "Situacao de pagamento invalida." });
  }

  const order = {
    id: request.body.id || makeOrderId(),
    ...orderPayload,
    createdAt: request.body.createdAt || new Date().toISOString(),
    paidAt: orderPayload.paymentStatus === "CONFIRMED" ? new Date().toISOString() : undefined,
    createdBy: "owner",
  };

  await saveOrder(order);
  return response.status(201).json(order);
});

app.get("/api/orders", async (request, response) => {
  const email = String(request.query.email || "").trim().toLowerCase();
  if (!email) {
    return response.status(400).json({ error: "Informe o e-mail da conta para consultar pedidos." });
  }

  const orders = await syncPendingMercadoPagoOrders(await readOrders());
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
      paymentStatus: paymentMethod === "PayPal" ? "WAITING_PAYPAL" : paymentMethod === "PIX" ? "WAITING_PIX" : paymentMethod === "Cartao" ? "WAITING_CARD" : "WAITING_MANUAL_CONFIRMATION",
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

    if (paymentMethod === "Cartao") {
      if (!mercadoPagoIsConfigured()) {
        return response.status(503).json({
          error: "Cartao automatico ainda nao configurado. Adicione MERCADO_PAGO_ACCESS_TOKEN no Render.",
        });
      }

      const preference = await createCardCheckoutPreference({ order, total: order.total });
      order.mercadoPagoPreferenceId = preference.id;
      order.paymentProvider = "Mercado Pago";
      order.paymentPayload = { preferenceId: preference.id };
      await saveOrder(order);
      return response.status(201).json({
        order,
        approvalUrl: preference.initPoint || preference.sandboxInitPoint,
        message: "Pedido criado. Redirecione o cliente para pagamento com cartao.",
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
    const paymentId = extractMercadoPagoPaymentId(request);
    if (!paymentId) {
      return response.sendStatus(204);
    }

    await applyMercadoPagoPayment(paymentId);
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

app.patch("/api/admin/orders/:orderId", requireAdmin, async (request, response) => {
  let blockedByPayment = false;
  const order = await updateOrder(request.params.orderId, (current) => {
    const next = normalizeAdminOrderPayload(request.body, current);
    if (!orderStatuses.includes(next.status)) {
      return current;
    }
    if (!paymentStatuses.includes(next.paymentStatus)) {
      return current;
    }

    const paidIndex = orderStatuses.indexOf(paidStatus);
    const selectedIndex = orderStatuses.indexOf(next.status);
    if (selectedIndex > paidIndex && next.paymentStatus !== "CONFIRMED" && current.status !== paidStatus) {
      blockedByPayment = true;
      return current;
    }

    return {
      ...current,
      ...next,
      paymentStatus: next.status === paidStatus ? "CONFIRMED" : next.paymentStatus,
      paidAt: (next.status === paidStatus || next.paymentStatus === "CONFIRMED") && !current.paidAt
        ? new Date().toISOString()
        : current.paidAt,
      updatedAt: new Date().toISOString(),
    };
  });

  if (!order) return response.status(404).json({ error: "Pedido nao encontrado." });
  if (blockedByPayment) return response.status(409).json({ error: "Pagamento ainda nao confirmado." });
  return response.json(order);
});

app.delete("/api/admin/orders/:orderId", requireAdmin, async (request, response) => {
  const deleted = await deleteOrder(request.params.orderId);
  if (!deleted) return response.status(404).json({ error: "Pedido nao encontrado." });
  return response.json({ ok: true, order: deleted });
});

app.listen(port, () => {
  console.log(`ARCADE.CO API running on http://127.0.0.1:${port}`);
});

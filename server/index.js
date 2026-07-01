import cors from "cors";
import "dotenv/config";
import express from "express";
import { capturePayPalOrder, createPayPalOrder, verifyPayPalWebhook } from "./paypal.js";
import { findOrderByPayPalId, readOrders, saveOrder, updateOrder } from "./storage.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const clientBaseUrl = process.env.CLIENT_BASE_URL || "http://127.0.0.1:5173";

app.use(cors({ origin: clientBaseUrl }));
app.use(express.json({ limit: "1mb" }));

const makeOrderId = () => `ARC-${Date.now().toString().slice(-6)}`;

const calculateTotal = (items = []) =>
  items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);

const paidStatus = "Pagamento confirmado";
const orderStatuses = ["Aguardando pagamento", paidStatus, "Em producao", "Enviado", "Entregue"];

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

app.get("/api/orders", async (_request, response) => {
  response.json(await readOrders());
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
      paymentStatus: paymentMethod === "PayPal" ? "WAITING_PAYPAL" : "WAITING_MANUAL_CONFIRMATION",
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

app.patch("/api/orders/:orderId/status", async (request, response) => {
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

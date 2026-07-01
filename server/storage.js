import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const dataFile = resolve("server", "data", "orders.json");

const ensureDataFile = async () => {
  await mkdir(dirname(dataFile), { recursive: true });
  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, "[]", "utf8");
  }
};

export const readOrders = async () => {
  await ensureDataFile();
  const content = await readFile(dataFile, "utf8");
  return JSON.parse(content || "[]");
};

export const writeOrders = async (orders) => {
  await ensureDataFile();
  await writeFile(dataFile, JSON.stringify(orders, null, 2), "utf8");
};

export const saveOrder = async (order) => {
  const orders = await readOrders();
  const nextOrders = [order, ...orders.filter((entry) => entry.id !== order.id)];
  await writeOrders(nextOrders);
  return order;
};

export const updateOrder = async (orderId, updater) => {
  const orders = await readOrders();
  let updatedOrder = null;
  const nextOrders = orders.map((order) => {
    if (order.id !== orderId) return order;
    updatedOrder = { ...order, ...updater(order) };
    return updatedOrder;
  });
  await writeOrders(nextOrders);
  return updatedOrder;
};

export const findOrderByPayPalId = async (paypalOrderId) => {
  const orders = await readOrders();
  return orders.find((order) => order.paypalOrderId === paypalOrderId);
};

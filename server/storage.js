import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ordersFile = resolve("server", "data", "orders.json");
const productsFile = resolve("server", "data", "products.json");

const defaultProducts = [
  {
    id: "ribbed-black",
    name: "Ribbed Black",
    category: "Camisetas",
    color: "Preto",
    tag: "Mais vendida",
    image: "/images/polo-black.png",
    price: 249.9,
    oldPrice: 299.9,
    description: "Ribana preta premium, gola com ziper metalico e logo discreta.",
    active: true,
  },
  {
    id: "ribbed-white",
    name: "Ribbed White",
    category: "Camisetas",
    color: "Branco",
    tag: "Edicao limitada",
    image: "/images/polo-white.png",
    price: 249.9,
    oldPrice: 299.9,
    description: "Ribana branca premium, acabamento limpo e caimento elegante.",
    active: true,
  },
];

const ensureDataFile = async (file, fallback = "[]") => {
  await mkdir(dirname(file), { recursive: true });
  try {
    await readFile(file, "utf8");
  } catch {
    await writeFile(file, fallback, "utf8");
  }
};

export const readOrders = async () => {
  await ensureDataFile(ordersFile);
  const content = await readFile(ordersFile, "utf8");
  return JSON.parse(content || "[]");
};

export const writeOrders = async (orders) => {
  await ensureDataFile(ordersFile);
  await writeFile(ordersFile, JSON.stringify(orders, null, 2), "utf8");
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

export const deleteOrder = async (orderId) => {
  const orders = await readOrders();
  const order = orders.find((entry) => entry.id === orderId);
  if (!order) return null;
  await writeOrders(orders.filter((entry) => entry.id !== orderId));
  return order;
};

export const findOrderByPayPalId = async (paypalOrderId) => {
  const orders = await readOrders();
  return orders.find((order) => order.paypalOrderId === paypalOrderId);
};

export const findOrderByMercadoPagoPaymentId = async (paymentId) => {
  const orders = await readOrders();
  return orders.find((order) => String(order.mercadoPagoPaymentId) === String(paymentId));
};

export const findOrderById = async (orderId) => {
  const orders = await readOrders();
  return orders.find((order) => order.id === orderId);
};

export const readProducts = async () => {
  await ensureDataFile(productsFile, JSON.stringify(defaultProducts, null, 2));
  const content = await readFile(productsFile, "utf8");
  const products = JSON.parse(content || "[]");
  return products.length ? products : defaultProducts;
};

export const writeProducts = async (products) => {
  await ensureDataFile(productsFile, JSON.stringify(defaultProducts, null, 2));
  await writeFile(productsFile, JSON.stringify(products, null, 2), "utf8");
};

export const saveProduct = async (product) => {
  const products = await readProducts();
  const nextProducts = [product, ...products.filter((entry) => entry.id !== product.id)];
  await writeProducts(nextProducts);
  return product;
};

export const updateProduct = async (productId, updater) => {
  const products = await readProducts();
  let updatedProduct = null;
  const nextProducts = products.map((product) => {
    if (product.id !== productId) return product;
    updatedProduct = { ...product, ...updater(product), updatedAt: new Date().toISOString() };
    return updatedProduct;
  });
  await writeProducts(nextProducts);
  return updatedProduct;
};

export const deleteProduct = async (productId) => {
  const products = await readProducts();
  const product = products.find((entry) => entry.id === productId);
  if (!product) return null;
  await writeProducts(products.filter((entry) => entry.id !== productId));
  return product;
};

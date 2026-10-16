const express = require("express");
const { Pool } = require("pg");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const WHATSAPP_NUMBER = (process.env.WHATSAPP_NUMBER || "5516993702260").replace(/\D/g, "");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) console.warn("Aviso: DATABASE_URL não foi configurada.");
if (!ADMIN_PASSWORD) console.warn("Aviso: ADMIN_PASSWORD não foi configurada.");

const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
}) : null;

const starterProducts = [
  { name: "Arroz 5 kg", category: "Mercearia", price: 27.90, emoji: "🍚", description: "Arroz tipo 1" },
  { name: "Feijão 1 kg", category: "Mercearia", price: 8.49, emoji: "🫘", description: "Feijão carioca" },
  { name: "Óleo de soja 900 ml", category: "Mercearia", price: 6.99, emoji: "🫒", description: "Óleo de soja" },
  { name: "Leite 1 L", category: "Laticínios", price: 5.29, emoji: "🥛", description: "Leite integral" },
  { name: "Café 500 g", category: "Mercearia", price: 18.90, emoji: "☕", description: "Café torrado e moído" },
  { name: "Açúcar 5 kg", category: "Mercearia", price: 19.90, emoji: "🍬", description: "Açúcar refinado" },
  { name: "Banana 1 kg", category: "Hortifruti", price: 5.99, emoji: "🍌", description: "Banana selecionada" },
  { name: "Maçã 1 kg", category: "Hortifruti", price: 9.90, emoji: "🍎", description: "Maçã fresca" },
  { name: "Pão de forma", category: "Padaria", price: 8.49, emoji: "🍞", description: "Pão de forma tradicional" },
  { name: "Ovos com 12", category: "Frios e ovos", price: 12.90, emoji: "🥚", description: "Bandeja com 12 ovos" },
  { name: "Detergente", category: "Limpeza", price: 2.49, emoji: "🧽", description: "Detergente líquido" },
  { name: "Papel higiênico 12 rolos", category: "Higiene", price: 17.90, emoji: "🧻", description: "Pacote com 12 rolos" }
];

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Outros',
      price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
      emoji TEXT NOT NULL DEFAULT '🛒',
      description TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      payment TEXT NOT NULL,
      items JSONB NOT NULL,
      total NUMERIC(10,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'Recebido',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const count = await pool.query("SELECT COUNT(*)::int AS n FROM products");
  if (count.rows[0].n === 0) {
    for (const p of starterProducts) {
      await pool.query(
        "INSERT INTO products(name,category,price,emoji,description) VALUES($1,$2,$3,$4,$5)",
        [p.name, p.category, p.price, p.emoji, p.description]
      );
    }
  }
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}
const sessions = new Set();
function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token");
  if (!token || !sessions.has(token)) return res.status(401).json({ error: "Faça login novamente." });
  next();
}

app.get("/api/config", (req, res) => res.json({ whatsappNumber: WHATSAPP_NUMBER }));
app.get("/api/products", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: "Banco de dados ainda não configurado." });
    const result = await pool.query("SELECT id,name,category,price,emoji,description FROM products WHERE active=TRUE ORDER BY id");
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Não foi possível carregar os produtos." });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: "Banco de dados ainda não configurado." });
    const { customerName, phone, address, payment, items } = req.body || {};
    if (!customerName?.trim() || !phone?.trim() || !address?.trim() || !payment || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Preencha seus dados e adicione produtos ao carrinho." });
    }
    if (customerName.length > 100 || phone.length > 30 || address.length > 500 || items.length > 100) {
      return res.status(400).json({ error: "Algum campo passou do limite permitido." });
    }
    const ids = items.map(x => Number(x.id));
    if (ids.some(x => !Number.isInteger(x) || x <= 0)) return res.status(400).json({ error: "Produto inválido." });
    const quantities = new Map();
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) return res.status(400).json({ error: "Quantidade inválida." });
      quantities.set(Number(item.id), (quantities.get(Number(item.id)) || 0) + qty);
    }
    const productIds = [...quantities.keys()];
    const result = await pool.query("SELECT id,name,price FROM products WHERE active=TRUE AND id=ANY($1::int[])", [productIds]);
    if (result.rows.length !== productIds.length) return res.status(400).json({ error: "Um produto do carrinho não está mais disponível." });
    const byId = new Map(result.rows.map(p => [p.id, p]));
    const orderItems = productIds.map(id => {
      const p = byId.get(id), quantity = quantities.get(id);
      return { id, name: p.name, price: Number(p.price), quantity, subtotal: Number(p.price) * quantity };
    });
    const total = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
    const saved = await pool.query(
      "INSERT INTO orders(customer_name,phone,address,payment,items,total) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
      [customerName.trim(), phone.trim(), address.trim(), payment, JSON.stringify(orderItems), total.toFixed(2)]
    );
    res.status(201).json({ orderId: saved.rows[0].id, total, items: orderItems });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Não foi possível registrar o pedido." });
  }
});

app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PASSWORD || !SESSION_SECRET) return res.status(503).json({ error: "Configure ADMIN_PASSWORD e SESSION_SECRET na hospedagem." });
  const password = String(req.body?.password || "");
  const a = Buffer.from(password), b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Senha incorreta." });
  const token = makeToken();
  sessions.add(token);
  res.json({ token });
});

app.get("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const r = await pool.query("SELECT id,name,category,price,emoji,description,active FROM products ORDER BY id DESC");
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: "Erro ao listar produtos." }); }
});
app.post("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const { name, category, price, emoji, description } = req.body || {};
    const amount = Number(price);
    if (!name?.trim() || name.length > 120 || !Number.isFinite(amount) || amount < 0 || amount > 999999) {
      return res.status(400).json({ error: "Informe nome e preço válido." });
    }
    const r = await pool.query(
      "INSERT INTO products(name,category,price,emoji,description) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [name.trim(), String(category || "Outros").slice(0,60), amount, String(emoji || "🛒").slice(0,8), String(description || "").slice(0,250)]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: "Não foi possível adicionar o produto." }); }
});
app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const r = await pool.query("UPDATE products SET active=NOT active WHERE id=$1 RETURNING id,active", [Number(req.params.id)]);
    if (!r.rowCount) return res.status(404).json({ error: "Produto não encontrado." });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: "Não foi possível atualizar o produto." }); }
});
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const r = await pool.query("SELECT id,customer_name,phone,address,payment,items,total,status,created_at FROM orders ORDER BY created_at DESC LIMIT 100");
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: "Não foi possível carregar os pedidos." }); }
});
app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  const allowed = ["Recebido", "Em preparação", "Saiu para entrega", "Concluído", "Cancelado"];
  const status = String(req.body?.status || "");
  if (!allowed.includes(status)) return res.status(400).json({ error: "Status inválido." });
  try {
    const r = await pool.query("UPDATE orders SET status=$1 WHERE id=$2 RETURNING id,status", [status, Number(req.params.id)]);
    if (!r.rowCount) return res.status(404).json({ error: "Pedido não encontrado." });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: "Não foi possível atualizar o pedido." }); }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

initDb().then(() => {
  app.listen(PORT, () => console.log(`Max Mercado rodando na porta ${PORT}`));
}).catch(err => {
  console.error("Falha ao iniciar banco de dados:", err);
  process.exit(1);
});

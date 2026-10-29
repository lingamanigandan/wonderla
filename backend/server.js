const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const dotenv = require("dotenv");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === "production";

if (!process.env.DB_PASSWORD || !process.env.SESSION_SECRET) {
  throw new Error("Set DB_PASSWORD and SESSION_SECRET in your .env file.");
}

if (process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters long.");
}

if (isProduction) {
  // Configure this appropriately if deployed behind a trusted proxy.
  app.set("trust proxy", 1);
}

app.use(helmet());
const allowedOrigins = [
  "http://127.0.0.1:5501",
  "http://localhost:5501",
  "http://127.0.0.1:5500",
  "http://localhost:5500"
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5500",
    credentials: true
  })
);

app.use(express.json({ limit: "1mb" }));

const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "pharmacy_db",
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "pharmacy_db",
  port: Number(process.env.DB_PORT || 3306),
  createDatabaseTable: true
});

app.use(
  session({
    name: "medicare.sid",
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 30 * 60 * 1000
    }
  })
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later."
  }
});

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Please sign in first."
    });
  }

  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).json({
        success: false,
        message: "Please sign in first."
      });
    }

    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action."
      });
    }

    next();
  };
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// Health checks
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "MediCare Pharmacy API is running"
  });
});

app.get(
  "/api/db-test",
  asyncRoute(async (req, res) => {
    await db.query("SELECT 1");
    res.json({ success: true, message: "Database connected" });
  })
);

// LOGIN
app.post(
  "/api/auth/login",
  loginLimiter,
  asyncRoute(async (req, res) => {
    const { username, password } = req.body || {};

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !password ||
      username.length > 80 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid username and password."
      });
    }

    const [rows] = await db.execute(
      `SELECT id, name, username, password_hash, role, is_active
       FROM users
       WHERE username = ?
       LIMIT 1`,
      [username.trim()]
    );

    const user = rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password."
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password."
      });
    }

    req.session.regenerate((error) => {
      if (error) {
        return res.status(500).json({
          success: false,
          message: "Unable to sign in. Please try again."
        });
      }

      req.session.user = {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role
      };

      req.session.save((saveError) => {
        if (saveError) {
          return res.status(500).json({
            success: false,
            message: "Unable to establish a session."
          });
        }

        res.json({
          success: true,
          message: "Login successful.",
          user: req.session.user
        });
      });
    });
  })
);

// CURRENT SIGNED-IN USER
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ success: true, user: req.session.user });
});

// LOGOUT
app.post("/api/auth/logout", requireAuth, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie("medicare.sid", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax"
    });

    res.json({ success: true, message: "Logged out successfully." });
  });
});

// CUSTOMER LIST
app.get(
  "/api/customers",
  requireAuth,
  asyncRoute(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT id, name, phone, email, address, created_at
       FROM customers
       ORDER BY id DESC`
    );

    res.json({ success: true, data: rows });
  })
);

// ADD CUSTOMER
app.post(
  "/api/customers",
  requireAuth,
  asyncRoute(async (req, res) => {
    const { name, phone, email = null, address = null } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof phone !== "string" ||
      !phone.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Customer name and phone are required."
      });
    }

    const [result] = await db.execute(
      `INSERT INTO customers (name, phone, email, address)
       VALUES (?, ?, ?, ?)`,
      [
        name.trim(),
        phone.trim(),
        typeof email === "string" && email.trim() ? email.trim() : null,
        typeof address === "string" && address.trim()
          ? address.trim()
          : null
      ]
    );

    res.status(201).json({
      success: true,
      message: "Customer added successfully.",
      id: result.insertId
    });
  })
);

// UPDATE CUSTOMER
app.put(
  "/api/customers/:id",
  requireAuth,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const { name, phone, email = null, address = null } = req.body || {};

    if (
      !Number.isInteger(id) ||
      id < 1 ||
      typeof name !== "string" ||
      !name.trim() ||
      typeof phone !== "string" ||
      !phone.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid customer ID, name and phone."
      });
    }

    const [result] = await db.execute(
      `UPDATE customers
       SET name = ?, phone = ?, email = ?, address = ?
       WHERE id = ?`,
      [
        name.trim(),
        phone.trim(),
        typeof email === "string" && email.trim() ? email.trim() : null,
        typeof address === "string" && address.trim()
          ? address.trim()
          : null,
        id
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Customer not found."
      });
    }

    res.json({ success: true, message: "Customer updated successfully." });
  })
);

// DELETE CUSTOMER
app.delete(
  "/api/customers/:id",
  requireRole("Admin"),
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID."
      });
    }

    const [result] = await db.execute(
      "DELETE FROM customers WHERE id = ?",
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Customer not found."
      });
    }

    res.json({ success: true, message: "Customer deleted successfully." });
  })
);

// BARCODE LOOKUP
app.get(
  "/api/barcode/:barcode",
  requireAuth,
  asyncRoute(async (req, res) => {
    const barcode = String(req.params.barcode || "").trim();

    if (!barcode || barcode.length > 40) {
      return res.status(400).json({
        success: false,
        message: "Invalid barcode."
      });
    }

    const [medicines] = await db.execute(
      `SELECT id, name, barcode, category, batch, qty, cost, price
       FROM medicines
       WHERE barcode = ?
       LIMIT 1`,
      [barcode]
    );

    if (!medicines.length) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found."
      });
    }

    const medicine = medicines[0];

    const [batches] = await db.execute(
      `SELECT id, medicine_id, batch_number, quantity, mrp, expiry_date
       FROM medicine_batches
       WHERE medicine_id = ?
         AND quantity > 0
         AND expiry_date >= CURDATE()
       ORDER BY expiry_date ASC`,
      [medicine.id]
    );

    res.json({
      success: true,
      medicine,
      batches
    });
  })
);

// LIST MEDICINE BATCHES
app.get(
  "/api/medicine-batches",
  requireAuth,
  asyncRoute(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT
         mb.id,
         mb.medicine_id,
         mb.batch_number,
         mb.quantity,
         mb.mrp,
         mb.expiry_date,
         m.name,
         m.barcode,
         m.category
       FROM medicine_batches mb
       JOIN medicines m ON m.id = mb.medicine_id
       ORDER BY mb.expiry_date ASC`
    );

    res.json({ success: true, data: rows });
  })
);

// ADD A BATCH TO AN EXISTING MEDICINE
app.post(
  "/api/medicine-batches",
  requireRole("Admin", "Pharmacist"),
  asyncRoute(async (req, res) => {
    const {
      medicine_id,
      batch_number,
      quantity,
      mrp,
      expiry_date
    } = req.body || {};

    const medicineId = Number(medicine_id);
    const qty = Number(quantity);
    const price = Number(mrp);

    if (
      !Number.isInteger(medicineId) ||
      medicineId < 1 ||
      typeof batch_number !== "string" ||
      !batch_number.trim() ||
      !Number.isInteger(qty) ||
      qty < 1 ||
      !Number.isFinite(price) ||
      price < 0 ||
      typeof expiry_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(expiry_date)
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide valid medicine, batch, quantity, MRP and expiry date."
      });
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [medicineRows] = await connection.execute(
        "SELECT id FROM medicines WHERE id = ? FOR UPDATE",
        [medicineId]
      );

      if (!medicineRows.length) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Medicine not found."
        });
      }

      const [batchResult] = await connection.execute(
        `INSERT INTO medicine_batches
          (medicine_id, batch_number, quantity, mrp, expiry_date)
         VALUES (?, ?, ?, ?, ?)`,
        [medicineId, batch_number.trim(), qty, price, expiry_date]
      );

      // Keep the legacy medicines.qty total in sync.
      await connection.execute(
        "UPDATE medicines SET qty = qty + ? WHERE id = ?",
        [qty, medicineId]
      );

      await connection.commit();

      res.status(201).json({
        success: true,
        message: "Medicine batch added successfully.",
        id: batchResult.insertId
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

// BILLING
// Expected request body:
// {
//   "customer_id": 1,
//   "payment_method": "Cash",
//   "items": [{ "batch_id": 1, "quantity": 2 }]
// }
app.post(
  "/api/billing",
  requireAuth,
  asyncRoute(async (req, res) => {
    const {
      customer_id = null,
      payment_method,
      items
    } = req.body || {};

    if (!["Cash", "UPI", "Card"].includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: "Payment method must be Cash, UPI or Card."
      });
    }

    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Add at least one item to the bill."
      });
    }

    const normalizedItems = [];
    const requested = new Map();

    for (const item of items) {
      const batchId = Number(item.batch_id);
      const quantity = Number(item.quantity);

      if (
        !Number.isInteger(batchId) ||
        batchId < 1 ||
        !Number.isInteger(quantity) ||
        quantity < 1
      ) {
        return res.status(400).json({
          success: false,
          message: "Each item must have a valid batch ID and quantity."
        });
      }

      requested.set(batchId, (requested.get(batchId) || 0) + quantity);
    }

    for (const [batchId, quantity] of requested) {
      normalizedItems.push({ batchId, quantity });
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      let customerName = "Walk-in Customer";

      if (customer_id !== null) {
        const customerId = Number(customer_id);

        if (!Number.isInteger(customerId) || customerId < 1) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: "Invalid customer ID."
          });
        }

        const [customerRows] = await connection.execute(
          "SELECT id, name FROM customers WHERE id = ?",
          [customerId]
        );

        if (!customerRows.length) {
          await connection.rollback();
          return res.status(404).json({
            success: false,
            message: "Customer not found."
          });
        }

        customerName = customerRows[0].name;
      }

      const invoice = `MC${Date.now()}${crypto.randomBytes(3).toString("hex")}`
        .toUpperCase()
        .slice(0, 30);

      const saleItems = [];
      let subtotal = 0;

      for (const item of normalizedItems) {
        const [rows] = await connection.execute(
          `SELECT
             mb.id AS batch_id,
             mb.medicine_id,
             mb.batch_number,
             mb.quantity,
             mb.mrp,
             mb.expiry_date,
             m.name
           FROM medicine_batches mb
           JOIN medicines m ON m.id = mb.medicine_id
           WHERE mb.id = ?
           FOR UPDATE`,
          [item.batchId]
        );

        const batch = rows[0];

        if (!batch) {
          throw Object.assign(new Error("A selected batch was not found."), {
            statusCode: 400
          });
        }

        if (batch.expiry_date < new Date().toISOString().slice(0, 10)) {
          throw Object.assign(
            new Error(`Expired stock cannot be sold: ${batch.name}.`),
            { statusCode: 400 }
          );
        }

        if (Number(batch.quantity) < item.quantity) {
          throw Object.assign(
            new Error(`Insufficient stock for ${batch.name}.`),
            { statusCode: 400 }
          );
        }

        const unitPrice = Number(batch.mrp);
        const lineTotal = Number((unitPrice * item.quantity).toFixed(2));

        subtotal = Number((subtotal + lineTotal).toFixed(2));

        saleItems.push({
          batch_id: batch.batch_id,
          medicine_id: batch.medicine_id,
          medicine_name: batch.name,
          batch_number: batch.batch_number,
          quantity: item.quantity,
          unit_price: unitPrice,
          line_total: lineTotal
        });

        await connection.execute(
          `UPDATE medicine_batches
           SET quantity = quantity - ?
           WHERE id = ?`,
          [item.quantity, item.batchId]
        );

        await connection.execute(
          `UPDATE medicines
           SET qty = GREATEST(qty - ?, 0)
           WHERE id = ?`,
          [item.quantity, batch.medicine_id]
        );
      }

      // This version does not calculate GST because the exact tax
      // configuration in the existing database has not been confirmed.
      const gstAmount = 0;
      const total = Number((subtotal + gstAmount).toFixed(2));

      await connection.execute(
        `INSERT INTO sales
          (invoice, sale_date, customer_id, customer_name,
           subtotal, gst_amount, total, payment_method, paid)
         VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice,
          customer_id === null ? null : Number(customer_id),
          customerName,
          subtotal,
          gstAmount,
          total,
          payment_method,
          total
        ]
      );

      for (const item of saleItems) {
        await connection.execute(
          `INSERT INTO sale_items
            (invoice, batch_id, medicine_id, medicine_name,
             batch_number, quantity, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoice,
            item.batch_id,
            item.medicine_id,
            item.medicine_name,
            item.batch_number,
            item.quantity,
            item.unit_price,
            item.line_total
          ]
        );
      }

      await connection.execute(
        `INSERT INTO sale_payments (invoice, pay_date, amount, method)
         VALUES (?, CURDATE(), ?, ?)`,
        [invoice, total, payment_method]
      );

      await connection.commit();

      res.status(201).json({
        success: true,
        message: "Bill created successfully.",
        invoice,
        subtotal,
        gst_amount: gstAmount,
        total,
        payment_method,
        items: saleItems
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

// SALES HISTORY
app.get(
  "/api/sales",
  requireAuth,
  asyncRoute(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT
         invoice,
         sale_date,
         customer_id,
         customer_name,
         subtotal,
         gst_amount,
         total,
         payment_method,
         paid
       FROM sales
       ORDER BY sale_date DESC, invoice DESC
       LIMIT 500`
    );

    res.json({ success: true, data: rows });
  })
);

// GLOBAL ERROR HANDLER
app.use((error, req, res, next) => {
  console.error("API error:", error.message);

  if (res.headersSent) return next(error);

  res.status(error.statusCode || 500).json({
    success: false,
    message:
      error.statusCode && error.statusCode < 500
        ? error.message
        : "An internal server error occurred."
  });
});

// START SERVER
async function startServer() {
  try {
    await db.query("SELECT 1");
    console.log("MySQL database connected.");

    app.listen(PORT, () => {
      console.log(`MediCare Pharmacy API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Unable to start server:", error.message);
    process.exit(1);
  }
}

startServer();
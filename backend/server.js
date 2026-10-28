
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const db = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "lingam@pream",
    database: process.env.DB_NAME || "pharmacy_db",
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10
});

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "MediCare Pharmacy API is running"
    });
});

app.get("/api/db-test", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT DATABASE() AS database_name"
        );

        res.json({
            success: true,
            message: "MySQL connected successfully",
            database: rows[0].database_name
        });
    } catch (error) {
        console.error("Database error:", error.message);
        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});

// Read all customers
app.get("/api/customers", async (req, res) => {
    try {
        const [customers] = await db.query(`
            SELECT id, name, phone, email, address, created_at
            FROM customers
            ORDER BY id DESC
        `);

        res.json({
            success: true,
            customers
        });
    } catch (error) {
        console.error("Fetch customers error:", error.message);
        res.status(500).json({
            success: false,
            message: "Could not fetch customers. Check the database and table."
        });
    }
});

// Add a customer
app.post("/api/customers", async (req, res) => {
    try {
        const { name, phone, email, address } = req.body;

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
                typeof email === "string" && email.trim()
                    ? email.trim()
                    : null,
                typeof address === "string" && address.trim()
                    ? address.trim()
                    : null
            ]
        );

        const [rows] = await db.execute(
            `SELECT id, name, phone, email, address, created_at
             FROM customers WHERE id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: "Customer saved successfully.",
            customer: rows[0]
        });
    } catch (error) {
        console.error("Save customer error:", error.message);
        res.status(500).json({
            success: false,
            message: "Could not save customer."
        });
    }
});

// Update a customer
app.put("/api/customers/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { name, phone, email, address } = req.body;

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
                message: "Valid customer ID, name and phone are required."
            });
        }

        const [result] = await db.execute(
            `UPDATE customers
             SET name = ?, phone = ?, email = ?, address = ?
             WHERE id = ?`,
            [
                name.trim(),
                phone.trim(),
                email?.trim() || null,
                address?.trim() || null,
                id
            ]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: "Customer not found."
            });
        }

        res.json({
            success: true,
            message: "Customer updated successfully."
        });
    } catch (error) {
        console.error("Update customer error:", error.message);
        res.status(500).json({
            success: false,
            message: "Could not update customer."
        });
    }
});

// Delete a customer
app.delete("/api/customers/:id", async (req, res) => {
    try {
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

        res.json({
            success: true,
            message: "Customer deleted successfully."
        });
    } catch (error) {
        console.error("Delete customer error:", error.message);
        res.status(500).json({
            success: false,
            message: "Could not delete customer."
        });
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

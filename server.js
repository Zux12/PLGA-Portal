// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from /public
app.use(express.static("public"));

// --- MongoDB Connection ---
const mongoUri = process.env.MONGODB_URI;

mongoose
  .connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB (PLGA)");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });

// For now we don't define any models yet.
// Later we will add Activity, File, etc.

// --- Simple login route ---
// Hardcoded: username = "staff", password = "staff"
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "staff" && password === "staff") {
    return res.json({ success: true, message: "Login successful" });
  } else {
    return res
      .status(401)
      .json({ success: false, message: "Invalid username or password" });
  }
});

// Fallback route (optional)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

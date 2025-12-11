// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from /public
app.use(express.static("public"));

// Serve uploaded files from /public/uploads
const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));


// --- Multer setup for file uploads ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({ storage });

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

// Small helper
function pad2(n) {
  return n.toString().padStart(2, "0");
}

// --- Activity Schema & Model ---
const attachmentSchema = new mongoose.Schema(
  {
    fileName: String, // stored file name on server
    originalName: String,
    mimeType: String,
    size: Number,
    url: String, // /uploads/...
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const activitySchema = new mongoose.Schema({
  // Start date of activity
  date: { type: String, required: true }, // YYYY-MM-DD
  // End date of activity (>= date)
  endDate: { type: String, required: true },
  // Full day flag (ignores time if true)
  isFullDay: { type: Boolean, default: false },

  title: { type: String, required: true },
  category: { type: String, default: "Other" },
  phase: { type: String, default: "Unspecified" },
  status: { type: String, default: "Planned" },
  startTime: { type: String, default: "" }, // HH:mm
  endTime: { type: String, default: "" }, // HH:mm
  notes: { type: String, default: "" },
  attachments: [attachmentSchema],
  createdAt: { type: Date, default: Date.now },
});

const Activity = mongoose.model("Activity", activitySchema);

// --- Simple login route (hardcoded) ---
// username = "staff", password = "staff"
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

// --- Activity Routes ---

// Create new activity with optional file uploads
app.post(
  "/api/activities",
  upload.array("files", 10),
  async (req, res) => {
    try {
      let {
        date, // start date
        endDate,
        title,
        category,
        phase,
        status,
        startTime,
        endTime,
        notes,
        isFullDay,
      } = req.body;

      if (!date || !title) {
        return res
          .status(400)
          .json({ success: false, message: "Date and title are required." });
      }

      // Normalise endDate
      if (!endDate) {
        endDate = date;
      }

      // Make sure endDate >= date (string compare works for YYYY-MM-DD)
      if (endDate < date) {
        endDate = date;
      }

      const fullDayFlag =
        isFullDay === "true" || isFullDay === "on" || isFullDay === true;

      // If full day, clear times
      if (fullDayFlag) {
        startTime = "";
        endTime = "";
      }

      const attachments = (req.files || []).map((file) => ({
        fileName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `/uploads/${file.filename}`,
      }));

      const activity = new Activity({
        date,
        endDate,
        isFullDay: fullDayFlag,
        title,
        category,
        phase,
        status,
        startTime,
        endTime,
        notes,
        attachments,
      });

      await activity.save();

      res.json({ success: true, activity });
    } catch (err) {
      console.error("Error creating activity:", err);
      res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

// Get activities overlapping a given month
// Query: ?month=YYYY-MM
app.get("/api/activities", async (req, res) => {
  try {
    const { month } = req.query; // e.g. "2025-12"

    let filter = {};
    if (month) {
      const [yearStr, monthStr] = month.split("-");
      const y = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10); // 1-12

      const startOfMonth = `${yearStr}-${monthStr}-01`;
      const lastDayNum = new Date(y, m, 0).getDate(); // JS month m means next month index
      const endOfMonth = `${yearStr}-${monthStr}-${pad2(lastDayNum)}`;

      // Activities that overlap this month:
      // start date <= endOfMonth AND endDate >= startOfMonth
      filter = {
        date: { $lte: endOfMonth },
        endDate: { $gte: startOfMonth },
      };
    }

    const activities = await Activity.find(filter).sort({
      date: 1,
      startTime: 1,
      createdAt: 1,
    });

    res.json({ success: true, activities });
  } catch (err) {
    console.error("Error fetching activities:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Get activities for a specific date (any activity whose range covers that date)
// Query: ?date=YYYY-MM-DD
app.get("/api/activities/day", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res
        .status(400)
        .json({ success: false, message: "Date is required." });
    }

    const activities = await Activity.find({
      date: { $lte: date },
      endDate: { $gte: date },
    }).sort({
      date: 1,
      startTime: 1,
      createdAt: 1,
    });

    res.json({ success: true, activities });
  } catch (err) {
    console.error("Error fetching day activities:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Delete an activity (we keep files on disk for simplicity)
app.delete("/api/activities/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Activity.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting activity:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

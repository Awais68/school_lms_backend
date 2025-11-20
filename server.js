const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const courseRoutes = require("./routes/courses");
const attendanceRoutes = require("./routes/attendance");
const feeRoutes = require("./routes/fees");
const assignmentRoutes = require("./routes/assignments");
const quizRoutes = require("./routes/quizzes");
const gradeRoutes = require("./routes/grades");
const transportRoutes = require("./routes/transport");
const inventoryRoutes = require("./routes/inventory");
const expenseRoutes = require("./routes/expenses");
const libraryRoutes = require("./routes/library");
const chatbotRoutes = require("./routes/chatbot");
const biometricRoutes = require("./routes/biometric");
const healthRoutes = require("./routes/health");
const branchRoutes = require("./routes/branches");

// Create Express app
const app = express();

// Security middleware
app.use(helmet());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  })
);

// CORS configuration
// app.use(
//   cors({
//     origin: process.env.CLIENT_URL || "http://localhost:3000",
//     credentials: true,
//   })
// );

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://school-lms-frontend-ten.vercel.app",
    ],
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/fees", feeRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/grades", gradeRoutes);
app.use("/api/transport", transportRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/biometric", biometricRoutes);
app.use("/api/branches", branchRoutes);
app.use("/health", healthRoutes);

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ message: "School LMS API is running!" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "production" ? {} : err.message,
  });
});

// Create HTTP server
const server = http.createServer(app);

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Store connected users
const connectedUsers = new Map();

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Handle user connection
  socket.on("user_connected", (userId) => {
    connectedUsers.set(userId, socket.id);
    socket.userId = userId;
    console.log(`User ${userId} connected with socket ${socket.id}`);
  });

  // Handle attendance sync
  socket.on("attendance_sync", (data) => {
    io.emit("attendance_updated", data);
  });

  // Handle notifications
  socket.on("send_notification", (data) => {
    // Broadcast to all or specific users
    if (data.recipient) {
      const recipientSocketId = connectedUsers.get(data.recipient);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("notification", data);
      } else {
        io.emit("notification", data);
      }
    } else {
      io.emit("notification", data);
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    // Remove user from connected users
    for (let [userId, socketId] of connectedUsers) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        break;
      }
    }
  });
});

// Make io available to routes
app.set("io", io);

// Import seed function
const seedBranches = require("./utils/seedBranches");

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/school_lms", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("MongoDB connected");
    // Run seed functions
    await seedBranches();
  })
  .catch((err) => console.error("MongoDB connection error:", err));

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, io };

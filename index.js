const express = require("express");
require("dotenv").config();
const cors = require("cors");
const mongoose = require("mongoose");
const authRouter = require("./routes/authRoutes");
const userRouter = require("./routes/userRoutes");
const postRouter = require("./routes/postRoutes");
const path = require("path");
const commentRouter = require("./routes/commentRoutes");
const http = require("http");
const { Server } = require("socket.io");
const userSocket = require("./sockets/userSocket");

const MONGODB_URI = process.env.MONGO_URL;

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((error) => console.error(" Failed to connect to MongoDB:", error));

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

userSocket(io);

// Routes
app.use("/auth", authRouter);
app.use("/profile", userRouter);
app.use("/post", postRouter);
app.use("/posts", commentRouter);

const port = 4000;
server.listen(port, async () => {
  console.log(` Server running on http://localhost:${port}`);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});

const express = require("express");
require("dotenv").config();
const cors = require("cors");
const mongoose = require("mongoose");


const MONGODB_URI = process.env.MONGO_URL;

mongoose
  .connect(MONGODB_URI, {})
  .then(() => console.log("Connected to MongoDB"))
  .catch((error) => console.error("Failed to connect to MongoDB", error));

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);

const port = 4000;


app.listen(port, async () => {
  console.log(`Port is running ${port}`);
});

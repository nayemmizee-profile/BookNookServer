import cors from "cors";
import "dotenv/config";
import express from "express";
import { MongoClient, ObjectId } from "mongodb";

// first of all daclare APP and Port/Server address then call app.use .otherwise backend will be chrash
const app = express();
const PORT = 9000;

// Middleware . this middleware connect different port or address
app.use(cors());
app.use(express.json());

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URI);

// Globally daclare a variable which contain MongoDB Collection . Globally daclared becouse then i can use it outside of this funtion .
let allBooks;

async function connectToMongoDB() {
  try {
    // 1=> connect to MONGODB
    await client.connect();

    console.log("You successfully connected to MongoDB!");
    // 2 => Connect to Database
    const db = client.db("BookNook");

    // 3 => connect to database collection.here i can connect many database collection to the server .
    allBooks = db.collection("allBooks");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

// Get All Books .here i use allBooks collection to get data from database . "/AllBooks" is API endpoint ( "http://localhost9000/AllBooks")
app.get("/AllBooks", async (req, res) => {
  try {
    const result = await allBooks.find().toArray();
    res.status(200).send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch books",
    });
  }
});

// here i make a route for _id
// Get Single Book Details by ID
app.get("/AllBooks/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    // Find book by ID
    const book = await allBooks.findOne({
      _id: new ObjectId(id),
    });

    // Check if book exists
    if (!book) {
      return res.status(404).send({
        message: "Book not found",
      });
    }

    res.status(200).send(book);
  } catch (error) {
    console.error("Book details fetching error:", error);

    res.status(500).send({
      message: "Failed to fetch book details",
    });
  }
});

// Home Route . "http://localhost9000" is the base API URL
app.get("/", (req, res) => {
  res.send({
    message: "Server is running fine!",
  });
});

// Start Server
async function startServer() {
  await connectToMongoDB();

  app.listen(PORT, () => {
    console.log(`Server is running at ${PORT}`);
  });
}

startServer();

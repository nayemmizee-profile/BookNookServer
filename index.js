import cors from "cors";
import "dotenv/config";
import express from "express";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const PORT = process.env.PORT || 9000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Configuration
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI is missing from environment variables!");
}

const client = new MongoClient(mongoUri);

let db;
let allBooks;

// MongoDB Connection
let connectionPromise;

async function connectToMongoDB() {
  if (db && allBooks) {
    return;
  }

  if (!connectionPromise) {
    connectionPromise = client
      .connect()
      .then(() => {
        console.log("Successfully connected to MongoDB!");

        db = client.db("BookNook");
        allBooks = db.collection("allBooks");
      })
      .catch((error) => {
        connectionPromise = null;
        console.error("MongoDB Connection Error:", error);
        throw error;
      });
  }

  await connectionPromise;
}

// Ensure database connection before routes
app.use(async (req, res, next) => {
  try {
    await connectToMongoDB();
    next();
  } catch (error) {
    console.error("Database connection failed:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// Home Route
app.get("/", (req, res) => {
  res.send("BookNook Library API is running!");
});

// Get All Books
app.get("/AllBooks", async (req, res) => {
  try {
    const books = await allBooks.find().toArray();

    res.status(200).json(books);
  } catch (error) {
    console.error("Get All Books Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch books",
    });
  }
});

// Get Single Book
app.get("/AllBooks/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    const book = await allBooks.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    res.status(200).json(book);
  } catch (error) {
    console.error("Get Single Book Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch book details",
    });
  }
});

// Add New Book
app.post("/AddBook", async (req, res) => {
  try {
    const data = req.body;

    if (!data.title || !data.author || !data.category) {
      return res.status(400).json({
        success: false,
        message: "Title, author and category are required",
      });
    }

    const totalCopies = Number(data.totalCopies ?? 1);

    if (!Number.isInteger(totalCopies) || totalCopies < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a positive integer",
      });
    }

    const newBook = {
      ...data,
      totalCopies,
      createdAt: new Date(),
    };

    const result = await allBooks.insertOne(newBook);

    res.status(201).json({
      success: true,
      message: "Book added successfully!",
      bookId: result.insertedId.toString(),
    });
  } catch (error) {
    console.error("Add Book Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to add book",
    });
  }
});

// Local Development Server
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

// Vercel Serverless Export
export default app;

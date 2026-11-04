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

// Get My Books
app.get("/MyBooks", async (req, res) => {
  try {
    // 1. Verify internal secret
    const secret = req.headers["x-internal-secret"];

    if (secret !== process.env.INTERNAL_API_SECRET) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // 2. Get user ID
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // 3. Get books from allBooks collection
    const myBooks = await db
      .collection("allBooks")
      .find({ userId: userId })
      .toArray();

    // 4. Return books
    return res.status(200).json({
      success: true,
      totalBooks: myBooks.length,
      books: myBooks,
    });
  } catch (error) {
    console.error("MyBooks Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch My Books",
    });
  }
});

// Get My Borrowed Books
app.get("/MyBorrow", async (req, res) => {
  try {
    // 1. Verify internal secret
    const secret = req.headers["x-internal-secret"];

    if (secret !== process.env.INTERNAL_API_SECRET) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // 2. Get user ID
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // 3. Get borrowed books from Borrow collection
    const myBorrow = await db
      .collection("Borrow")
      .find({
        userId: userId,
        status: "borrowed",
      })
      .toArray();

    // 4. Return borrowed books
    return res.status(200).json({
      success: true,
      totalBorrowed: myBorrow.length,
      borrowedBooks: myBorrow,
    });
  } catch (error) {
    console.error("MyBorrow Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch borrowed books",
    });
  }
});

// Vercel Serverless Export
export default app;

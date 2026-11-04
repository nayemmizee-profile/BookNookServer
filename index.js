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

// ========================================
// Update My Book
// ========================================
app.put("/MyBooks/:id", async (req, res) => {
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

    // 3. Get book ID
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    // 4. Validate update data
    const { title, author, category, description, image, totalCopies } =
      req.body;

    if (!title || !author || !category) {
      return res.status(400).json({
        success: false,
        message: "Title, author and category are required",
      });
    }

    const copies = Number(totalCopies);

    if (!Number.isInteger(copies) || copies < 1) {
      return res.status(400).json({
        success: false,
        message: "Total copies must be a positive integer",
      });
    }

    // 5. Update only user's own book
    const result = await allBooks.updateOne(
      {
        _id: new ObjectId(id),
        userId: userId,
      },
      {
        $set: {
          title,
          author,
          category,
          description,
          image,
          totalCopies: copies,
          updatedAt: new Date(),
        },
      },
    );

    // 6. Check if book exists
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found or you are not authorized",
      });
    }

    // 7. Success response
    return res.status(200).json({
      success: true,
      message: "Book updated successfully!",
    });
  } catch (error) {
    console.error("Update MyBook Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update book",
    });
  }
});

// ========================================
// Delete My Book
// ========================================
app.delete("/MyBooks/:id", async (req, res) => {
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

    // 3. Get book ID
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    // 4. Delete only user's own book
    const result = await allBooks.deleteOne({
      _id: new ObjectId(id),
      userId: userId,
    });

    // 5. Check if book exists
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found or you are not authorized",
      });
    }

    // 6. Success response
    return res.status(200).json({
      success: true,
      message: "Book deleted successfully!",
    });
  } catch (error) {
    console.error("Delete MyBook Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete book",
    });
  }
});

// Get My Borrowed Books
app.get("/MyBorrow", async (req, res) => {
  try {
    // 1. Verify Internal Secret
    const secret = req.headers["x-internal-secret"];

    if (secret !== process.env.INTERNAL_API_SECRET) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // 2. Get User ID
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // 3. Find Borrowed Books
    const myBorrow = await db
      .collection("Borrow")
      .find({
        userId: userId,
        status: "Borrowed",
      })
      .toArray();

    // 4. Return Response
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

/* ===============================
   GET MY BORROWED BOOKS
================================ */

app.get("/MyBorrow", async (req, res) => {
  try {
    // 1. Verify internal secret
    const secret = req.headers["x-internal-secret"];

    if (secret !== process.env.INTERNAL_API_SECRET) {
      return res.status(401).send({
        success: false,
        message: "Unauthorized access",
      });
    }

    // 2. Get user ID
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return res.status(400).send({
        success: false,
        message: "User ID is required",
      });
    }

    // 3. Connect to Borrow collection
    const borrowCollection = db.collection("Borrow");

    // 4. Find active borrowed books
    const borrowedBooks = await borrowCollection
      .find({
        userId: userId,
        status: "Borrowed",
      })
      .sort({ borrowDate: -1 })
      .toArray();

    // 5. Send response
    res.status(200).send({
      success: true,
      totalBorrowed: borrowedBooks.length,
      borrowedBooks,
    });
  } catch (error) {
    console.error("MyBorrow Backend Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch borrowed books",
    });
  }
});

/* ===============================
   RETURN BORROWED BOOK
================================ */

app.patch("/ReturnBook", async (req, res) => {
  try {
    // 1. Verify internal secret
    const secret = req.headers["x-internal-secret"];

    if (secret !== process.env.INTERNAL_API_SECRET) {
      return res.status(401).send({
        success: false,
        message: "Unauthorized access",
      });
    }

    // 2. Get user ID
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return res.status(400).send({
        success: false,
        message: "User ID is required",
      });
    }

    // 3. Get borrow ID
    const { borrowId } = req.body;

    if (!ObjectId.isValid(borrowId)) {
      return res.status(400).send({
        success: false,
        message: "Invalid Borrow ID",
      });
    }

    // 4. Connect collection
    const borrowCollection = db.collection("Borrow");

    // 5. Update only the owner's active borrow
    const result = await borrowCollection.updateOne(
      {
        _id: new ObjectId(borrowId),
        userId: userId,
        status: "Borrowed",
      },
      {
        $set: {
          status: "Returned",
          returnedAt: new Date(),
        },
      },
    );

    // 6. Check if book exists
    if (result.matchedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "Borrow record not found or already returned.",
      });
    }

    // 7. Success response
    res.status(200).send({
      success: true,
      message: "Book returned successfully!",
    });
  } catch (error) {
    console.error("Return Book Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to return book",
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

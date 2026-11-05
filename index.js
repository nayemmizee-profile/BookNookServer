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

/* ===============================
   GET MY BORROWED BOOKS
================================ */

// Borrow a Book
// ========================================
// Borrow a Book
// START: Replace existing POST /Borrow API
// ========================================

app.post("/Borrow", async (req, res) => {
  const session = client.startSession();

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
    const { bookId } = req.body;

    if (!ObjectId.isValid(bookId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Book ID",
      });
    }

    // 4. Connect Borrow collection
    const borrowCollection = db.collection("Borrow");

    // 5. Start MongoDB Transaction
    session.startTransaction();

    // 6. Find book
    const book = await allBooks.findOne(
      {
        _id: new ObjectId(bookId),
      },
      { session },
    );

    if (!book) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    // 7. Check existing active borrow
    const existingBorrow = await borrowCollection.findOne(
      {
        userId,
        bookId,
        status: "Borrowed",
      },
      { session },
    );

    if (existingBorrow) {
      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message: "You have already borrowed this book",
      });
    }

    // 8. Decrease available book copies
    const stockUpdate = await allBooks.updateOne(
      {
        _id: new ObjectId(bookId),
        totalCopies: { $gt: 0 },
      },
      {
        $inc: { totalCopies: -1 },
      },
      { session },
    );

    if (stockUpdate.modifiedCount === 0) {
      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message: "Book is currently unavailable",
      });
    }

    // 9. Set borrow and return dates
    const borrowDate = new Date();
    const returnDate = new Date();

    returnDate.setDate(returnDate.getDate() + 14);

    // 10. Create borrow record
    const borrowData = {
      userId,
      bookId,
      bookTitle: book.title,
      author: book.author,
      bookImage: book.image,
      category: book.category,
      borrowDate,
      returnDate,
      status: "Borrowed",
      createdAt: new Date(),
    };

    const result = await borrowCollection.insertOne(borrowData, {
      session,
    });

    // 11. Commit Transaction
    await session.commitTransaction();

    // 12. Success response
    return res.status(201).json({
      success: true,
      message: "Book borrowed successfully!",
      borrowId: result.insertedId.toString(),
    });
  } catch (error) {
    // Rollback if any operation fails
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error("Borrow Book Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to borrow book",
    });
  } finally {
    await session.endSession();
  }
});

// ========================================
// END: Existing POST /Borrow API
// ========================================

/* ===============================
   RETURN BORROWED BOOK
================================ */

// ========================================
// RETURN BORROWED BOOK
// START: Replace existing PATCH /ReturnBook API
// ========================================

app.patch("/ReturnBook", async (req, res) => {
  const session = client.startSession();

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

    // 5. Start MongoDB Transaction
    session.startTransaction();

    // 6. Find owner's active borrow record
    const borrowRecord = await borrowCollection.findOne(
      {
        _id: new ObjectId(borrowId),
        userId: userId,
        status: "Borrowed",
      },
      { session },
    );

    if (!borrowRecord) {
      await session.abortTransaction();

      return res.status(404).send({
        success: false,
        message: "Borrow record not found or already returned.",
      });
    }

    // 7. Validate book ID
    if (!ObjectId.isValid(borrowRecord.bookId)) {
      throw new Error("Invalid book ID in borrow record");
    }

    // 8. Update borrow status
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
      { session },
    );

    if (result.modifiedCount === 0) {
      await session.abortTransaction();

      return res.status(404).send({
        success: false,
        message: "Borrow record not found or already returned.",
      });
    }

    // 9. Increase available book copies
    const stockUpdate = await allBooks.updateOne(
      {
        _id: new ObjectId(borrowRecord.bookId),
      },
      {
        $inc: { totalCopies: 1 },
      },
      { session },
    );

    if (stockUpdate.matchedCount === 0) {
      throw new Error("Original book not found in allBooks collection");
    }

    // 10. Commit Transaction
    await session.commitTransaction();

    // 11. Success response
    return res.status(200).send({
      success: true,
      message: "Book returned successfully!",
    });
  } catch (error) {
    // Rollback if any operation fails
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error("Return Book Error:", error);

    return res.status(500).send({
      success: false,
      message: "Failed to return book",
    });
  } finally {
    await session.endSession();
  }
});

// ========================================
// END: Existing PATCH /ReturnBook API
// ========================================

// Local Development Server
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

// Vercel Serverless Export
export default app;

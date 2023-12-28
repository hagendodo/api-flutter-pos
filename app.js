import express from "express";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  query,
  orderBy,
  where,
} from "firebase/firestore";

import bcrypt, { compare, hash } from "bcrypt";
import dotenv from "dotenv";
import cors from "cors";
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
const storage = new Storage();

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const apps = initializeApp(firebaseConfig);
const db = getFirestore(apps);

const itemsCollection = collection(db, "items");
const ordersCollection = collection(db, "orders");
const usersCollection = collection(db, "users");

app.use(
  cors({
    origin: "*",
    methods: ["*"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/api/register", async (req, res) => {
  try {
    const { kodeToko, namaToko, username, password } = req.body;

    if (!namaToko || !username || !password) {
      return res.status(400).json({
        error: "Bad Request - Nama Toko, Username, and password are required",
      });
    }

    // Hash the password before storing it
    const hashedPassword = await hash(password, 10); // You can adjust the saltRounds as needed

    // Store user data in Firestore
    const userRef = await addDoc(collection(db, "users"), {
      kodeToko: kodeToko,
      namaToko: namaToko,
      username: username,
      hashedPassword: hashedPassword,
      role: "owner",
    });

    res.status(201).json({ uid: userRef.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Login route
app.post("/api/login", async (req, res) => {
  try {
    const { kode, username, password } = req.body;

    if (!username || !kode || !password) {
      return res.status(400).json({
        error: "Bad Request - Username, Kode, and password are required",
      });
    }

    const querySnapshot = await getDocs(
      query(usersCollection, where("kodeToko", "==", kode))
    );

    let data = null;
    let docId = "";

    querySnapshot.forEach((doc) => {
      if (doc.exists()) {
        docId = doc.id;
        data = doc.data();
      }
    });

    if (!data) {
      return res.status(201).json({ error: "Unauthorized - User not found" });
    }

    if (data.username !== username) {
      return res.status(201).json({ error: "Unauthorized - User not found" });
    }

    const passwordMatch = await compare(password, data.hashedPassword);
    if (!passwordMatch) {
      return res.status(201).json({ error: "Unauthorized - User not found" });
    }

    return res.status(200).json({
      id: docId,
      data: data,
    });

    // // Step 1: Check if the user with the provided username and kode exists
    // const userQuery = query(
    //   collection(db, "users"),
    //   where("username", "==", username)
    // );
    // const userQuerySnapshot = await getDocs(userQuery);

    // if (userQuerySnapshot.empty) {
    //   return res.status(201).json({ error: "Unauthorized - User not found" });
    // }

    // // Assuming there's only one user with the given username and kode
    // const userDoc = userQuerySnapshot.docs[0];
    // console.log(userQuerySnapshot.docs[0]);
    // // Step 2: Check if kode is equal to the _id of the document
    // const documentId = userDoc.data()._id;

    // if (documentId === kode) {
    //   // Step 3: Validate the provided password using bcrypt
    //   const storedHashedPassword = userDoc.data().hashedPassword;

    //   // Compare the stored hashed password with the provided password
    //   const passwordMatch = await bcrypt.compare(
    //     password,
    //     storedHashedPassword
    //   );

    //   if (passwordMatch) {
    //     res.status(200).json({ uid: userDoc.id });
    //   } else {
    //     res.status(401).json({ error: "Unauthorized - Invalid password" });
    //   }
    // } else {
    //   res.status(401).json({ error: "Unauthorized - Invalid Kode" });
    // }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    // Ensure req.body is not empty
    if (!req.body) {
      return res.status(400).json({ error: "Bad Request - Empty body" });
    }

    // You can add additional validation or processing logic for the fields

    // Create a new document in Firestore with the provided details
    const newItemRef = await addDoc(ordersCollection, req.body);

    res.status(201).json({ id: newItemRef.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Read all items
app.get("/api/orders", async (req, res) => {
  try {
    const snapshot = await getDocs(
      query(collection(db, "orders"), orderBy("tanggal", "desc"))
    );

    // Use map to create an array of items
    const items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Create item
app.post("/api/items", async (req, res) => {
  try {
    // Ensure req.body is not empty
    if (!req.body) {
      return res.status(400).json({ error: "Bad Request - Empty body" });
    }

    // Extract other fields from the request body
    const { name, price } = req.body;

    // Handle file upload
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Bad Request - No file uploaded" });
    }

    // Upload the image to Firebase Storage
    const bucket = storage.bucket("image-flutter-pos"); // Replace with your actual Firebase Storage bucket name
    const fileName = `${Date.now()}_${uuidv4()}`;
    const fileUpload = bucket.file(fileName);

    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
      },
    });

    stream.on("error", (err) => {
      console.error(err);
      res
        .status(500)
        .json({ error: "Internal Server Error - Image upload failed" });
    });

    stream.on("finish", async () => {
      // The image has been successfully uploaded to Firebase Storage
      // Get the download URL
      const downloadUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

      // Create a new document in Firestore with the image URL and other details
      const newItemRef = await addDoc(itemsCollection, {
        name,
        price,
        imageUrl: downloadUrl,
      });

      res.status(201).json({ id: newItemRef.id });
    });

    stream.end(file.buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Read all items
app.get("/api/items", async (req, res) => {
  try {
    const snapshot = await getDocs(itemsCollection);

    // Use map to create an array of items
    const items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Read one item
app.get("/api/items/:id", async (req, res) => {
  try {
    const itemId = req.params.id;
    const itemDoc = await itemsCollection.doc(itemId).get();

    if (!itemDoc.exists) {
      res.status(404).json({ error: "Item not found" });
    } else {
      res.json({ id: itemDoc.id, ...itemDoc.data() });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update item
app.put("/api/items/:id", async (req, res) => {
  try {
    const itemId = req.params.id;
    const itemDoc = itemsCollection.doc(itemId);

    const updatedItem = await itemDoc.set(req.body, { merge: true });

    res.json({ id: itemId, ...updatedItem });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete item
app.delete("/api/items/:id", async (req, res) => {
  try {
    const itemId = req.params.id;
    await deleteDoc(doc(db, "items", itemId));

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

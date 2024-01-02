import express from "express";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { compare, hash } from "bcrypt";
import dotenv from "dotenv";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

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
    const { kodeToko, namaToko, kodeCabang, namaCabang, username, password } =
      req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: "Bad Request - Username and password are required",
      });
    }

    let userData;

    if (kodeToko && namaToko) {
      // Registration for "toko"
      userData = {
        kodeToko,
        namaToko,
        username,
        hashedPassword: await hash(password, 10),
        role: "owner",
      };
    } else if (kodeCabang && namaCabang) {
      // Registration for "cabang"
      userData = {
        kodeToko,
        kodeCabang,
        namaCabang,
        username,
        hashedPassword: await hash(password, 10),
        role: "cabang",
      };
    } else {
      // Invalid request without kodeToko or kodeCabang
      return res.status(400).json({
        error: "Bad Request - Either kodeToko or kodeCabang is required",
      });
    }

    // Store user data in Firestore
    const userRef = await addDoc(collection(db, "users"), userData);

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

    const checkingKode = kode.substring(0, 2);

    if (!username || !kode || !password) {
      return res.status(400).json({
        error: "Bad Request - Username, Kode, and password are required",
      });
    }

    let querySnapshot;

    if (checkingKode == "CB") {
      querySnapshot = await getDocs(
        query(usersCollection, where("kodeCabang", "==", kode))
      );
    } else {
      querySnapshot = await getDocs(
        query(usersCollection, where("kodeToko", "==", kode))
      );
    }

    let data = null;
    let docId = "";

    querySnapshot.forEach((doc) => {
      if (doc.exists()) {
        docId = doc.id;
        data = doc.data();
        data.namaToko = "";
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.patch("/api/users/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const { kodeToko, namaToko, username, password } = req.body;

    // Check if at least one field is provided for update
    if (!kodeToko && !namaToko && !username && !password) {
      console.log("here");
      return res.status(400).json({
        error: "Bad Request - At least one field is required for update",
      });
    }

    // Prepare an object with fields to update
    const updateFields = {};
    if (kodeToko) updateFields.kodeToko = kodeToko;
    if (namaToko) updateFields.namaToko = namaToko;
    if (username) updateFields.username = username;

    // Hash the password before storing it
    if (password) {
      const hashedPassword = await hash(password, 10); // You can adjust the saltRounds as needed
      updateFields.hashedPassword = hashedPassword;
    }

    // Perform the update in Firestore
    await updateDoc(doc(db, "users", userId), updateFields);

    res.status(200).json({ id: userId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/cabang/:kodeToko", async (req, res) => {
  try {
    const kodeToko = req.params.kodeToko;

    if (!kodeToko) {
      return res.status(404).json({ error: "Kode Toko not found" });
    }

    let baseQuery = query(usersCollection, where("kodeToko", "==", kodeToko));

    baseQuery = query(baseQuery, where("role", "==", "cabang"));

    const querySnapshot = await getDocs(baseQuery);
    const data = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.delete("/api/cabang/:id", async (req, res) => {
  try {
    const itemId = req.params.id;
    await deleteDoc(doc(db, "users", itemId));

    res.json({ success: true });
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
    const { kodeToko, kodeCabang } = req.query;
    const cekCabang = kodeCabang && kodeCabang !== "";

    if (!kodeToko) {
      return res.status(404).json({ error: "Kode Toko not found" });
    }

    let baseQuery = query(ordersCollection, where("kodeToko", "==", kodeToko));

    if (cekCabang) {
      baseQuery = query(baseQuery, where("kodeCabang", "==", kodeCabang));
    }

    const snapshot = await getDocs(baseQuery, orderBy("tanggal", "desc"));
    // Check if no orders were found
    if (snapshot.empty) {
      return res.status(404).json({ error: "No orders found" });
    }

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
    const { userId, kodeToko, name, price, imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "Bad Request - No file uploaded" });
    } else {
      // Handle case where imageUrl is provided (not uploading a file)
      // Create a new document in Firestore with the provided image URL and other details
      const newItemRef = await addDoc(itemsCollection, {
        userId,
        kodeToko,
        name,
        price,
        imageUrl,
      });

      res.status(201).json({ id: newItemRef.id });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Read all items
app.get("/api/items", async (req, res) => {
  try {
    const { kodeToko, kodeCabang } = req.query;
    const cekCabang = kodeCabang && kodeCabang !== "";

    if (!kodeToko) {
      return res.status(404).json({ error: "Kode Toko not found" });
    }

    let baseQuery = query(itemsCollection, where("kodeToko", "==", kodeToko));

    if (cekCabang) {
      baseQuery = query(baseQuery, where("kodeCabang", "==", kodeCabang));
    }

    const querySnapshot = await getDocs(baseQuery);
    const data = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(data);
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
app.patch("/api/items/:id", async (req, res) => {
  try {
    const itemId = req.params.id;
    // const itemDoc = getDoc(itemsCollection, itemId);

    // const updatedItem = await itemDoc.set(req.body, { merge: true });

    const cityRef = doc(db, "items", itemId);
    const updatedItem = await setDoc(cityRef, req.body, { merge: true });

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

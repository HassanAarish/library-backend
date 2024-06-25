/**
 * @swagger
 * components:
 *   schemas:
 *     Book:
 *       type: object
 *       required:
 *       security:
 *         - Authorization: []
 *         - title
 *         - category
 *         - author
 *         - price
 *         - isRented
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated id of the book
 *         title:
 *           type: string
 *           description: The title of your book
 *         category:
 *           type: string
 *           description: The title of your book default is Anonymous
 *         author:
 *           type: string
 *           description: The book author default is Anonymous
 *         price:
 *           type: number
 *           description: The price of the book default is zero
 *         isRented:
 *           type: boolean
 *           description: Whether the book is rented or not default is false
 *
 *       example:
 *         id: d5fE_asz
 *         title: The New Turing Omnibus
 *         category: Anonymous
 *         author: Anonymous
 *         price: 10
 *         isRented: false
 */

/**
 * @swagger
 * tags:
 *   name: Books
 *   description: API endpoints for managing books
 *
 * /all:
 *   get:
 *     summary: Lists all the books
 *     tags: [Books]
 *     responses:
 *       200:
 *         description: The list of all books
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Book'
 *       500:
 *         description: Server error
 *
 * /search:
 *   get:
 *     summary: Search any keyword
 *     tags: [Books]
 *     parameters:
 *       - in: path
 *         name: category
 *         schema:
 *           type: string
 *         required: true
 *         description: The category of books to retrieve
 *     responses:
 *       200:
 *         description: Here are your result
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Book'
 *       404:
 *         description: No results found
 *       500:
 *         description: Server error
 *
 * /genre/{category}:
 *   get:
 *     summary: Get books by category
 *     tags: [Books]
 *     parameters:
 *       - in: path
 *         name: category
 *         schema:
 *           type: string
 *         required: true
 *         description: The category of books to retrieve
 *     responses:
 *       200:
 *         description: A list of books in the specified category
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Book'
 *       404:
 *         description: No books found in the specified category
 *       500:
 *         description: Server error
 *
 * /user-order:
 *   get:
 *     summary: Get user orders
 *     tags: [Books]
 *     security:
 *       - Authorization: []
 *     responses:
 *       200:
 *         description: A list of orders belonging to the current user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Order'
 *       401:
 *         description: Unauthorized, user not authenticated
 *       500:
 *         description: Server error
 * /new-order:
 *   post:
 *     summary: Create a new order
 *     tags: [Books]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Order'
 *     responses:
 *       200:
 *         description: New order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       401:
 *         description: Unauthorized, user not authenticated
 *       500:
 *         description: Server error
 *
 * /signup:
 *   post:
 *     summary: User signup
 *     tags: [Books]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       200:
 *         description: User signed up successfully
 *       500:
 *         description: Server error
 *
 * /login:
 *   post:
 *     summary: User login
 *     tags: [Books]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User logged in successfully
 *       401:
 *         description: Unauthorized, invalid credentials
 *       500:
 *         description: Server error
 *
 * /admin-signup:
 *   post:
 *     summary: Admin signup
 *     tags: [Books]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminUser'
 *     responses:
 *       200:
 *         description: Admin user signed up successfully
 *       401:
 *         description: Unauthorized, user not authenticated or not an admin
 *       500:
 *         description: Server error
 *
 * /{id}:
 *   get:
 *     summary: Get a book by ID
 *     tags: [Books]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the book to retrieve
 *     responses:
 *       200:
 *         description: The book retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Book'
 *       404:
 *         description: Book not found
 *       500:
 *         description: Server error
 */

import express, { Router } from "express";
import {
  getAllbooks,
  getByCategory,
  getById,
  searchBook,
} from "../controller/BooksController.js";
import { login, createUser } from "../controller/UserController.js";
import { createOrder, getUserOrders } from "../controller/OrderController.js";

const route = express.Router();

route.get("/all", getAllbooks);
route.get("/search", searchBook);
route.get("/genre/:category", getByCategory);
route.get("/user-order", getUserOrders);
route.post("/new-order", createOrder);
route.post("/signup", createUser);
route.post("/login", login);
route.get("/:id", getById);
export default route;

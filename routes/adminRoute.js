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
 * /add-new-book:
 *   post:
 *     summary: Create a new book
 *     tags: [Books]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Book'
 *     responses:
 *       200:
 *         description: The created book
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Book'
 *       401:
 *         description: Unauthorized, user not authenticated
 *       500:
 *         description: Server error
 * /all-users:
 *   get:
 *     summary: Get all user profiles (admin only)
 *     tags: [Books]
 *     security:
 *       - Authorization: []
 *     responses:
 *       200:
 *         description: A list of user profiles
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Unauthorized, user not authenticated or not an admin
 *       500:
 *         description: Server error
 * /delete-all:
 *   post:
 *     summary: Delete all books in the database
 *     tags: [Books]
 *     security:
 *       - Authorization: []
 *     responses:
 *       200:
 *         description: All books deleted successfully
 *       401:
 *         description: Unauthorized, user not authenticated
 *       500:
 *         description: Server error
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
 * /{id}:
 *   put:
 *     summary: Update a book by ID
 *     tags: [Books]
 *     security:
 *       - Authorization: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the book to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Book'
 *     responses:
 *       200:
 *         description: The book updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Book'
 *       404:
 *         description: Book not found
 *       500:
 *         description: Server error
 *
 *   delete:
 *     summary: Delete a book by ID
 *     tags: [Books]
 *     security:
 *       - Authorization: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the book to delete
 *     responses:
 *       200:
 *         description: Book deleted successfully
 *       404:
 *         description: Book not found
 *       500:
 *         description: Server error
 */

import express, { Router } from "express";
import verifyUserToken from "../middlewares/verifyUserToken.js";
import {
  addBook,
  deleteAll,
  deleteBook,
  getAllUserProfiles,
  updateBook,
} from "../controller/adminController.js";
import { adminUser } from "../controller/UserController.js";

const router = express.Router();

router.post("/add-new-book", verifyUserToken, addBook);
router.get("/all-users", verifyUserToken, getAllUserProfiles);
router.post("/delete-all", verifyUserToken, deleteAll);
router.post("/admin-signup", verifyUserToken, adminUser);
router.put("/:id", verifyUserToken, updateBook);
router.delete("/:id", verifyUserToken, deleteBook);

export default router;

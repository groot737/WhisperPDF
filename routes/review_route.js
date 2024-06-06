const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const passport = require('../config/passport-config');
const { authMiddleware, adminMiddleware } = require('../controllers/checkuser');
require('dotenv').config();

//create
router.post('/add', async (req, res) => {
    const { rating, description, bookId } = req.body;
    try {
        const book = await prisma.pdfBook.findUnique({
            where: { id: +bookId }
        });
        if (!book) {
            return res.status(500).json({ message: "Book not found" });
        }
        const review = await prisma.Review.create({
            data: {
                book_id: +bookId,
                user_id: +req.user.id,
                description: description,
                rating: +rating
            }
        });
        res.json("Review added");
    } catch (error) {
        console.error("Error adding review:", error);
        res.status(500).json({ message: "Error occurred while adding review" });
    }
});


// read
router.get('/:id')

// update
router.get('/update/:id')

// delete 
router.get('/delete/:id')

module.exports = router;
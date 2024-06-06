const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const passport = require('../config/passport-config');
const { authMiddleware, adminMiddleware } = require('../controllers/checkuser');
require('dotenv').config();

// Create
router.post('/add', async (req, res) => {
    const { bookId } = req.body; 
    if (req.isAuthenticated()) {
        try {
            const book = await prisma.pdfBook.findUnique({
                where: { id: +bookId }
            });
            if (!book) {
                return res.status(404).json({ message: "Book not found" });
            }
            const favourite = await prisma.Favourite.create({
                data: {
                    book_id: +bookId,
                    user_id: +req.user.id,
                }
            });
            res.status(200).json({ message: "Book added to favourites" });
        } catch (error) {
            console.error("Error adding to favourites:", error);
            res.status(500).json({ message: "Error occurred while adding to favourites" });
        }
    } else {
        res.status(401).json({ message: "You should log in to your account" });
    }
});


// Read
router.get('/:id', async(req, res) => {
    if(req.isAuthenticated()){
        //
    } else{
        res.status(401).json({ message: "you should log in to account" })
    }
})

// Delete
router.delete('/delete', async(req, res) => {
    if(req.isAuthenticated()){
        //
    } else{
        res.status(401).json({ message: "you should log in to account" })
    }
})

module.exports = router;
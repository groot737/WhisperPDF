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
router.get('/', async (req, res) => {
    if (req.isAuthenticated()) {
        const userId = req.user.id
        try {
            const favourites = await prisma.favourite.findMany({
                where: { user_id: userId }
            });
            if (!favourites || favourites.length === 0) {
                return res.status(404).json({ message: "Favourite books list is empty" });
            }
            let data = { total: favourites.length, books: [] };

            for (let i = 0; i < favourites.length; i++) {
                const book = await prisma.pdfBook.findUnique({
                    where: { id: favourites[i].book_id }
                });
                data.books.push({
                    title: book.title,
                    cover: book.cover_url,
                    id: favourites[i].book_id
                });
            }
            res.status(200).json(data);
        } catch (error) {
            console.error('Error occurred:', error);
            res.status(500).json({ message: 'Error occurred while listing favourite books' });
        }
    } else {
        res.status(401).json({ message: "You should log in to your account" });
    }
});


// Delete
router.delete('/delete', async(req, res) => {
    if(req.isAuthenticated()){
        const { favouriteId } = req.body;
        try {
            const deletedFavourite = await prisma.Favourite.delete({
                where: { id: +favouriteId }
            });
            if (!deletedFavourite) {
                return res.status(404).json({ message: "Favourite book not found" });
            }
            res.status(200).json({ message: "Favourite book deleted" });
        } catch (error) {
            console.error("Error deleting favourite book:", error);
            res.status(500).json({ message: "Error occurred while deleting favourite book" });
        }
    } else{
        res.status(401).json({ message: "you should log in to account" })
    }
})

module.exports = router;
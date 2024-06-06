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
router.patch('/update', async(req, res) =>{
    const reviewId = +req.body.reviewId; 
    const { description } = req.body;

    if (!description) {
        return res.status(400).json({ message: 'Description is required' });
    }

    try {
        const existingReview = await prisma.review.findUnique({
            where: { id: reviewId }
        });

        if (!existingReview) {
            return res.status(404).json({ message: 'Review not found' });
        }

        const updatedReview = await prisma.review.update({
            where: { id: reviewId },
            data: { description: description }
        });

        res.json(updatedReview);
    } catch (error) {
        console.error('Error updating review:', error);
        res.status(500).json({ message: 'Error occurred while updating review' });
    }
})

// delete 
router.delete('/delete', async (req, res) => {
    const { reviewId } = req.body;
    try {
        const deletedReview = await prisma.Review.delete({
            where: { id: +reviewId }
        });
        if (!deletedReview) {
            return res.status(404).json({ message: "Review not found" });
        }
        res.json({message: "Review deleted"});
    } catch (error) {
        console.error("Error deleting review:", error);
        res.status(500).json({ message: "Error occurred while deleting review" });
    }
});


module.exports = router;
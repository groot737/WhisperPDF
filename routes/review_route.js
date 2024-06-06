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
    if(req.isAuthenticated()){
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
    } else{
        res.status(401).json({message: "you should log in to account"})
    }
});


// read
router.get('/:id', async (req, res) => {
    const bookId = parseInt(req.params.id);

    try {
        const reviews = await prisma.review.findMany({
            where: { book_id: bookId }
        });

        if (reviews.length === 0) {
            return res.status(404).json({ message: "No reviews found for this book" });
        }

        let data = [{total_review: 0, average_rating: 0}, []];
        let counter = 0
        let sum = 0
        for (let j = 0; j < reviews.length; j++) {
            reviews[j]['created_at'] = reviews[j].created_at.toISOString().slice(0, reviews[j].created_at.toISOString().indexOf('-') + 6);

            // Fetch user data for each review
            const user = await prisma.users.findUnique({
                where: { id: reviews[j].user_id }
            });

            // Add username and profile_pic to the review
            reviews[j]['username'] = user.full_name;
            reviews[j]['profile_pic'] = user.profile_pic;
            counter ++
            sum += reviews[j].rating

            data[1].push(reviews[j]);
        }
        data[0].total_review = counter
        data[0].average_rating = parseFloat((sum / data[1].length).toFixed(2))

        res.json(data);

    } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({ message: "Error occurred" });
    }
});



// update
router.patch('/update', async(req, res) =>{
   if(req.isAuthenticated){
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
   } else {
    res.status(401).json({message: "you should log in to account"})
   }
})

// delete 
router.delete('/delete', async (req, res) => {
    if(req.isAuthenticated()){
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
    } else{
        res.status(401).json({message: "you should log in to account"})
    }
});


module.exports = router;
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
    const { itemId, itemType } = req.body; 

    if (req.isAuthenticated()) {
        return res.status(401).json({ message: "You should log in to your account" });
    }

    if (itemType !== 'book' && itemType !== 'booklist') {
        return res.status(500).json({ message: "Error occurred" });
    }

    try {
        // Check if item already exists in favourites
        const existingFavourite = await prisma.favourite.findFirst({
            where: {
                item_id: +itemId,
                user_id: +req.user.id,
                type: itemType
            }
        });

        if (existingFavourite) {
            return res.status(400).json({ message: `${itemType} is already in favourites` });
        }

        const item = await (itemType === 'book' 
            ? prisma.PdfBook.findUnique({ where: { id: +itemId } })
            : prisma.bookList.findUnique({ where: { id: +itemId } })
        );

        if (!item) {
            return res.status(404).json({ message: `${itemType} not found` });
        }

        await prisma.Favourite.create({
            data: {
                item_id: +itemId,
                user_id: +req.user.id,
                type: itemType
            }
        });

        res.status(200).json({ message: `${itemType} added to favourites` });
    } catch (error) {
        console.error("Error adding to favourites:", error);
        res.status(500).json({ message: "Error occurred while adding to favourites" });
    }
});


// Read
router.get('/', async (req, res) => {
    if (req.isAuthenticated()) {
        const userId = req.user.id
        try {
            const favourites = await prisma.favourite.findMany({
                where: { user_id: +req.user.id }
            });
            if (!favourites || favourites.length === 0) {
                return res.status(404).json({ message: "Favourite books list is empty" });
            }

            let data = [{name: "Book", items: [], total: 0}, {name: "Book list", items:[], total: 0}];
            let tempData = {}

            for(let i = 0; i < favourites.length; i++){
                if(favourites[i].type === "book"){

                    const book = await prisma.pdfBook.findUnique({
                        where: { id: favourites[i].item_id }
                    });
                    tempData['title'] = book['title']
                    tempData['cover'] = book['cover']
                    tempData['id'] = book['id']
                    data[0].items.push(tempData)
                    // count total
                    data[0].total ++

                } else {
                    const booklist = await prisma.bookList.findUnique({
                        where: { id: favourites[i].item_id }
                    });
                    data[1].items.push(booklist)
                    // count total
                    data[1].total ++
                }
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
                return res.status(404).json({ message: "Not found" });
            }
            res.status(200).json({ message: "Deleted" });
        } catch (error) {
            console.error("Error deleting favourite:", error);
            res.status(500).json({ message: "Error occurred" });
        }
    } else{
        res.status(401).json({ message: "you should log in to account" })
    }
})

module.exports = router;
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const passport = require('../config/passport-config');
const { authMiddleware, adminMiddleware } = require('../controllers/checkuser');
require('dotenv').config();

// create booklist
router.post('/create', async(req, res) => {
    const {title, description, category, language, isPrivate} = req.body
    if(req.isAuthenticated()){
        try{
            const favourite = await prisma.BookList.create({
                data: {
                    user_id: +req.user.id,
                    title: title,
                    description: description,
                    category_id: +category,
                    language_id: +language,
                    isPrivate: isPrivate,
                }
            });
            res.status(200).json({message: "Book list created"})
        }catch(error){
            console.log(error)
            res.status(500).json({ message: 'Error occurred while creating book list' });
        }
    } else{
        res.status(401).json({ message: "You should log in to your account" });
    }

})

// get booklist 
router.get('/:id', async (req, res) => {
    const listId = req.params.id;

    try {
        const bookListPromise = prisma.BookList.findUnique({
            where: { id: +listId }
        });

        const booksPromise = prisma.BookList_books.findMany({
            where: { booklist_id: +listId },
            select: { book_id: true } // Select only the book_id to reduce data transfer
        });

        const [bookList, books] = await Promise.all([bookListPromise, booksPromise]);

        const bookIds = books.map(book => book.book_id);

        const filteredData = await prisma.PdfBook.findMany({
            where: { id: { in: bookIds } } // Fetch all PdfBook records where id is in bookIds array
        });

        res.status(200).json({ bookList, filteredData });

    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "An error occurred while fetching the data" });
    }
});





// delete booklist
router.delete('/delete', async (req, res) => {
    const { listId } = req.body;
    try {
        const deleteBooks = await prisma.BookList_books.deleteMany({
            where: { booklist_id: +listId }
        });
        
        const deleteList = await prisma.BookList.deleteMany({
            where: { id: +listId }
        });

        res.status(200).json({ message: "BookList deleted" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "An error occurred while deleting the BookList" });
    }
});



// add book to booklist
router.post('/add', async (req, res) => {
    const { bookId, listId } = req.body;
    try {
        const findBook = await prisma.pdfBook.findUnique({
            where: { id: +bookId },
        });
        if (findBook) {
            const addBook = await prisma.BookList_books.create({
                data: {
                    book_id: +findBook.id,
                    booklist_id: +listId
                }
            })
            res.status(200).json({message: "Book added"})
        } else {
            res.status(404).json({ error: 'Book not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
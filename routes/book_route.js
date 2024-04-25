const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { createUser } = require('../config/dbfunction/register');
const passport = require('../config/passport-config');
const { createUserFolders, s3 } = require('../config/cloudfunction/createUserFolder');
const AWS = require('aws-sdk');
const { authMiddleware, adminMiddleware } = require('../controllers/checkuser');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { uploadToS3 } = require('../config/cloudfunction/uploads3')
const upload = multer({ dest: 'uploads/' });
require('dotenv').config();


// ======================= CRUD ENDPOINTS=====================//

//=============== CREATE ===========================//
router.post('/upload', upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  try {
    const { cover, pdf } = req.files;
    const { title, author, publisher, language, year, edition, description } = req.body
    const coverFileName = `${uuidv4()}-${cover[0].originalname}`;
    const pdfFileName = `${uuidv4()}-${pdf[0].originalname}`;

    fs.renameSync(cover[0].path, `uploads/${coverFileName}`);
    fs.renameSync(pdf[0].path, `uploads/${pdfFileName}`);

    await Promise.all([
      uploadToS3(req.user.id, 'covers', coverFileName, `uploads/${coverFileName}`),
      uploadToS3(req.user.id, 'pdfs', pdfFileName, `uploads/${pdfFileName}`),
    ]);

    fs.unlinkSync(`uploads/${coverFileName}`);
    fs.unlinkSync(`uploads/${pdfFileName}`);

    const newBook = await prisma.PdfBook.create({
      data: {
        cover_url: `https://s3.amazonaws.com/${process.env.BUCKET}/${req.user.id}/covers/${coverFileName}`,
        pdf_url: `https://s3.amazonaws.com/${process.env.BUCKET}/${req.user.id}/pdfs/${pdfFileName}`,
        title,
        author_name: author,
        category_id: 20,
        publisher,
        language,
        year: +year,
        edition,
        description,
        uploader_id: req.user.id,
      },
    });

    req.flash('success', 'Files uploaded successfully and book entry created');
    res.redirect('/upload-book');
  } catch (error) {
    console.error('Error uploading files or creating book entry:', error);

    req.flash('error', 'Error uploading files or creating book entry');
    res.redirect('/upload-book');
  }
});

// =========== READ ==================
router.get('/id/:id', async (req, res) => {
  try {
    const book = await prisma.pdfBook.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (book) {
      res.render('book', {book})
    } else {
      res.status(404).json({ isExist: false });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============== UPDATE ============================//
router.get('/edit', adminMiddleware, (req, res) => {
  res.render('edit-book')
})

router.post('/edit', upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  try {
    const { bookId, ...data } = req.body;

    for (const key in data) {
      if (data[key].trim() === '') {
        delete data[key];
      }
    }

    const book = await prisma.pdfBook.findUnique({
      where: { id: parseInt(bookId) },
    });

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    let coverUrl = book.cover_url;
    let pdfUrl = book.pdf_url;

    if (req.files['cover']) {
      const coverFile = req.files['cover'][0];
      const coverFilePath = coverFile.path;
      coverUrl = await uploadToS3(req.user.id, 'covers', coverUrl.slice(coverUrl.indexOf('/covers/') + 8), coverFilePath);
      fs.unlinkSync(coverFilePath)
    }

    if (req.files['pdf']) {
      const pdfFile = req.files['pdf'][0];
      const pdfFilePath = pdfFile.path;
      pdfUrl = await uploadToS3(req.user.id, 'pdfs', pdfUrl.slice(pdfUrl.indexOf('/pdfs/') + 6), pdfFilePath);
      fs.unlinkSync(pdfFilePath)
    }

    const updatedBook = await prisma.pdfBook.update({
      where: { id: parseInt(bookId) },
      data: {
        ...data,
        cover_url: coverUrl,
        pdf_url: pdfUrl,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating book:', err);
    res.status(500).json({ error: 'Error updating book' });
  }
});

// ============ Delete ================
router.get('/delete/:id', adminMiddleware, async (req, res) => {
  const itemId = parseInt(req.params.id);
  try {
    const existingItem = await prisma.pdfBook.findUnique({
      where: { id: itemId },
    });

    if (!existingItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const coverUrl = existingItem['cover_url'];
    const pdfUrl = existingItem['pdf_url'];

    const deleteFilesFromS3 = async (coverUrl, pdfUrl) => {
      try {
        const coverKey = coverUrl.slice(coverUrl.indexOf('/covers/') + 8);
        const pdfKey = pdfUrl.slice(pdfUrl.indexOf('/pdfs/') + 6);
        const deleteParams = {
          Bucket: process.env.BUCKET,
          Delete: {
            Objects: [
              { Key: req.user.id + '/covers/' + coverKey },
              { Key: req.user.id + '/pdfs/' + pdfKey },
            ],
          },
        };

        await s3.deleteObjects(deleteParams).promise();
        console.log('Files deleted from S3 successfully');

        // Delete item from the database after files are deleted from S3
        await prisma.pdfBook.delete({
          where: { id: existingItem["id"] },
        });

        // Send success response after both S3 deletion and database deletion
        res.json({ deleted: true });
      } catch (error) {
        console.error('Error deleting files from S3:', error);
        res.status(500).json({ error: 'Error deleting files from S3' });
      }
    };

    await deleteFilesFromS3(existingItem['cover_url'], existingItem['pdf_url']);

  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Error deleting item' });
  }
});

// =======================================================================

//============== LIST ================//
router.get('/list', adminMiddleware, async (req, res) => {
  try {
    const books = await prisma.PdfBook.findMany({
      where: { uploader_id: req.user.id },
    });
    res.render('books', { books })
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
});

// ================== SEARCH ENDPOINT ========================
router.post('/search', async (req, res) => {
  const search = req.body.title.trim().toLowerCase();
  const result = [];

  try {
    const books = await prisma.pdfBook.findMany();

    for (const book of books) {
      const title = book['title'].trim().toLowerCase();
      if (title.includes(search)) {
        result.push(book);
      }
    }

    if (result.length === 0) {
      res.json({ message: 'Search not found', result });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error('Error during search:', error);
    res.status(500).json({ error: 'Error during search' });
  }
});

module.exports = router;
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
const fetch = require('isomorphic-fetch')
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
      res.render('book', { book })
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
router.get('/search', async (req, res) => {
  let { title, language, type, category, yearfrom, yearto } = req.query;
  const validQuery = ["title", "language_id", "type", "category_id", "yearfrom", "yearto"];
  let filteredQuery = {};

  // Set default value for type
  type = type || "book";
  title = title || "";

  // Add type and title to filtered query
  filteredQuery['type'] = type;
  filteredQuery['title'] = title.trim().toLowerCase();

  // Get other parameters
  for (let data in req.query) {
    if (validQuery.includes(data)) {
      if (data !== 'title' && data !== 'type' && !isNaN(+req.query[data]) && req.query[data] !== '') {
        filteredQuery[data] = +req.query[data];
      }
    }
  }

  // Handle booklist type
  if (type === "booklist") {
    delete filteredQuery.yearfrom;
    delete filteredQuery.yearto;
    delete filteredQuery.type;
    filteredQuery['isPrivate'] = false;

    const booklist = await prisma.bookList.findMany({
      where: filteredQuery,
    });

    // Populate additional fields
    for (const book of booklist) {
      const category = await prisma.category.findUnique({ where: { id: +book['category_id'] } });
      book['category'] = category['name'];

      const language = await prisma.languages.findUnique({ where: { id: +book['language_id'] } });
      book['language'] = language['name'];

      const user = await prisma.users.findUnique({ where: { id: +book["user_id"] } });
      book['uploader_name'] = user['full_name'];
    }

    return res.send(booklist);
  }

  // Handle pdfBook type
  delete filteredQuery.type;
  delete filteredQuery.title;

  let dataFilter = {};
  for (let data in filteredQuery) {
    if (data === 'yearfrom') {
      dataFilter['gte'] = filteredQuery[data];
    } else if (data === 'yearto') {
      dataFilter['lte'] = filteredQuery[data];
    }
  }

  delete filteredQuery.yearfrom;
  delete filteredQuery.yearto;

  const books = await prisma.pdfBook.findMany({
    where: {
      AND: [
        filteredQuery, // Existing filters
        dataFilter && Object.keys(dataFilter).length > 0
          ? { year: dataFilter } // Year filter
          : {}, // Skip if no year conditions
        title
          ? { title: { contains: title.trim().toLowerCase() } } // Title filter without mode
          : {}, // If no title, skip this filter
      ],
    },
  });

  // Populate additional fields for each book
  for (const book of books) {
    const category = await prisma.category.findUnique({ where: { id: +book['category_id'] } });
    book['category'] = category['name'];

    const language = await prisma.languages.findUnique({ where: { id: +book['language_id'] } });
    book['language'] = language['name'];

    const user = await prisma.users.findUnique({ where: { id: +book["uploader_id"] } });
    book['uploader_name'] = user['full_name'];

    // Fetch average rating
    const ratingResponse = await fetch(`${process.env.DOMAIN}review/${book['id']}`);
    const ratingData = await ratingResponse.json();
    book['average_rating'] = ratingData[0] ? ratingData[0]['average_rating'] : null; // Handle if no ratings exist
  }

  res.send(books);
});


// =============== BOOK DOWNLOAD ===================
router.post('/download', adminMiddleware, async (req, res) => {
  const { bookId } = req.body;

  try {
    // Validate bookId
    if (bookId === undefined) {
      return res.status(400).json({ error: 'Invalid bookId' });
    }

    // Fetch PDF book link
    const bookLink = await prisma.pdfBook.findUnique({
      where: { id: +bookId }
    });

    // Redirect if book not found
    if (!bookLink) {
      return res.redirect('/');
    }

    const userId = req.user.id

    // Check if user is a subscriber
    const checkSubscriber = await prisma.subscriber.findMany({
      where: { user_id: userId }
    });

    if (checkSubscriber.length > 0) {
      return res.redirect(bookLink.pdf_url);
    }

    // Check if user data exists in download table
    const downloadOccurs = await prisma.download.findUnique({
      where: { user_id: userId }
    });

    if (downloadOccurs) {
      // Calculate time difference
      const lastDate = new Date(downloadOccurs.download_date);
      const hoursDiff = (new Date() - lastDate) / (1000 * 60 * 60);

      if (hoursDiff >= 12) {
        // Reset attempts and update download_date
        await prisma.download.update({
          where: { user_id: userId },
          data: {
            attempts: 0,
            download_date: new Date()
          }
        });
      } else {
        // Check if attempts limit is exceeded
        if (downloadOccurs.attempts >= 12) {
          return res.json('You have exceeded your download limit. Upgrade to remove the limit.');
        }

        // Increment attempts
        await prisma.download.update({
          where: { user_id: userId },
          data: {
            attempts: downloadOccurs.attempts + 1
          }
        });
      }
    } else {
      // Create new entry in download table
      await prisma.download.create({
        data: {
          user_id: userId,
          attempts: 1,
          download_date: new Date()
        }
      });
    }
    
    // check if book exists in downloads history
    const data_exist_in_history = await prisma.book_download_history.findMany({
      where: { user_id: +req.user.id, book_id: +bookId }
    })

    // if it doesn't exists then increase total_download value
    if (data_exist_in_history.length == 0) {
      await prisma.pdfBook.update({
        where: { uploader_id: +userId, id: +bookId },
        data: { total_download:{increment: 1} }
      })

    }

    // add book in download history
    await prisma.book_download_history.create({
      data: {
        user_id: +userId,
        book_id: +bookId,
        download_date: new Date()
      }
    })

    // Redirect to PDF URL after database operations
    res.redirect(bookLink.pdf_url);

  } catch (error) {
    console.error(error);
    res.redirect('/');
  }
});




module.exports = router;
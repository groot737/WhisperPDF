const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { createUser } = require('../config/dbfunction/register');
const bcrypt = require('bcrypt');
const passport = require('../config/passport-config');
const { createUserFolders, s3 } = require('../config/cloudfunction/createUserFolder');
const AWS = require('aws-sdk');
const { authMiddleware, adminMiddleware } = require('../controllers/checkuser');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { uploadToS3 } = require('../config/cloudfunction/uploads3')
require('dotenv').config();

const upload = multer({ dest: 'uploads/' });

router.get('/', (req, res) => {
  res.send('Whisperpdf is the future biggest open source pdf library');
});

// login endpoint
router.get("/login", authMiddleware, (req, res) => {
  res.render('login');
});

router.post(
  '/login',
  passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/login',
    failureFlash: true
  })
);

// LOG OUT USER
router.post('/logout', function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect('/');
  });
});

// register endpoint
router.get('/register', authMiddleware, (req, res) => {
  res.render('register');
});

router.post('/register', async (req, res) => {
  try {
    const { full_name, email, password } = req.body;
    const existingUser = await prisma.users.findUnique({
      where: { email: email },
    });

    if (existingUser) {
      req.flash('error', 'User with that email already exists.');
      res.redirect('/register');
    } else {
      const newUser = await createUser(full_name, email, password);

      createUserFolders(newUser.id)
        .then(() => {
          req.login(newUser, (err) => {
            if (err) {
              return next(err);
            }
            res.redirect('/dashboard');
          });
        })
        .catch((err) => {
          console.error('Error creating user folders:', err);
          req.flash('error', 'Internal server error.');
          res.redirect('/register');
        });
    }
  } catch (error) {
    console.error('Error registering user:', error);
    req.flash('error', 'Internal server error.');
    res.redirect('/register');
  }
});


// dashboard endpoint
router.get('/dashboard', adminMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.users.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new Error('User not found.');
    }

    res.render('dashboard', { user });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// UPLOAD ENDPOINT
router.post('/upload', upload.single('file'), async (req, res) => {
  const { fullname, bio } = req.body;

  try {
    if (fullname.trim().length !== 0) {
      await prisma.users.update({
        where: { id: req.user.id },
        data: { full_name: fullname.trim() },
      });
    }

    if (bio.trim().length !== 0) {
      await prisma.users.update({
        where: { id: req.user.id },
        data: { about: bio.trim() },
      });
    }
  } catch (updateError) {
    console.error('Error updating user data:', updateError);
    req.flash('error', 'Failed to update user data');
    res.redirect('/dashboard');
    return;
  }

  // Check if file was uploaded
  if (!req.file) {
    return res.redirect('/dashboard');
  }

  // Upload file
  const fileContent = fs.readFileSync(req.file.path);
  const params = {
    Bucket: process.env.BUCKET,
    Key: `${req.user.id}/avatar.png`, // Always upload with the same key (filename)
    Body: fileContent,
  };

  s3.upload(params, async (err, uploadData) => {
    if (err) {
      console.error('Error uploading file to S3:', err);
      req.flash('error', 'Failed to upload image');
      return res.redirect('/dashboard');
    }
    fs.unlinkSync(req.file.path); // Delete file from /uploads

    try {

      const updatedUser = await prisma.users.update({
        where: { id: req.user.id },
        data: { profile_pic: uploadData.Location },
      });

      req.flash('success', 'Image uploaded and user data updated successfully');
      res.redirect('/dashboard');
    } catch (updateError) {
      console.error('Error updating user data:', updateError);
      req.flash('error', 'Failed to update user data');
      res.redirect('/dashboard');
    }
  });
});

//========== DELETE ACCOUNT ==================
router.post('/delete-account', async (req, res) => {
  try {
    await prisma.pdfBook.deleteMany({
      where: { uploader_id: req.user.id },
    });

    await prisma.users.delete({
      where: { id: req.user.id },
    });

    const listParams = {
      Bucket: process.env.BUCKET,
      Prefix: `${req.user.id}/`,
    };
    s3.listObjectsV2(listParams, async (err, data) => {
      if (err) {
        console.error('Error listing objects in S3:', err);
        req.flash('error', 'Failed to delete user account');
        return res.redirect('/dashboard');
      }

      const objectsToDelete = data.Contents.map(obj => ({ Key: obj.Key }));
      if (objectsToDelete.length > 0) {
        const deleteParams = {
          Bucket: process.env.BUCKET,
          Delete: {
            Objects: objectsToDelete,
          },
        };
        s3.deleteObjects(deleteParams, (delErr, delData) => {
          if (delErr) {
            console.error('Error deleting objects in S3:', delErr);
            req.flash('error', 'Failed to delete user account');
            return res.redirect('/dashboard');
          }

          req.logout((logoutErr) => {
            if (logoutErr) {
              console.error('Error ending user session:', logoutErr);
            }
            req.flash('success', 'User account deleted successfully');
            res.redirect('/');
          });
        });
      } else {
        req.logout((logoutErr) => {
          if (logoutErr) {
            console.error('Error ending user session:', logoutErr);
          }
          req.flash('success', 'User account deleted successfully');
          res.redirect('/');
        });
      }
    });
  } catch (error) {
    console.error('Error deleting user account:', error);
    req.flash('error', 'Failed to delete user account');
    res.redirect('/dashboard');
  }
});

// ============= UPLOAD PDF BOOKS ==================
router.get('/pdf', adminMiddleware, (req, res) => {
  res.render('pdf')
})

router.post('/pdf', upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
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
    res.redirect('/pdf');
  } catch (error) {
    console.error('Error uploading files or creating book entry:', error);

    req.flash('error', 'Error uploading files or creating book entry');
    res.redirect('/pdf');
  }
});

//============== list user books ================//
router.get('/my-books', adminMiddleware, async (req, res) => {
  try {
    const books = await prisma.PdfBook.findMany({
      where: { uploader_id: req.user.id },
    });
    res.render('books', { books })
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
});


// ============ Delete single ebook (temporary code) ================//
router.get('/delete-book/:id', adminMiddleware, async (req, res) => {
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

// ============== EDIT BOOK DATA ============================//
router.get('/edit-book', adminMiddleware, (req, res) => {
  res.render('edit-book')
})

router.post('/edit-book', upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
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

// ================== SEARCH ENDPOINT ========================
router.get('/search/:name', async (req, res) => {
  const search = req.params.name.trim().toLowerCase();
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

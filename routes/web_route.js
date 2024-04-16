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

  // Update fullname and bio
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
    Bucket: 'whisperpdf',
    Key: `${req.user.id}/avatar.png`, // Always upload with the same key (filename)
    Body: fileContent,
  };

  s3.upload(params, async (err, uploadData) => {
    if (err) {
      console.error('Error uploading file to S3:', err);
      req.flash('error', 'Failed to upload image');
      return res.redirect('/dashboard');
    }
    console.log('File uploaded successfully:', uploadData.Location);
    fs.unlinkSync(req.file.path); // Delete file from /uploads

    try {
      // Update user's profile_pic to the new image URL
      const updatedUser = await prisma.users.update({
        where: { id: req.user.id },
        data: { profile_pic: uploadData.Location },
      });
      console.log('User data updated:', updatedUser);

      req.flash('success', 'Image uploaded and user data updated successfully');
      res.redirect('/dashboard');
    } catch (updateError) {
      console.error('Error updating user data:', updateError);
      req.flash('error', 'Failed to update user data');
      res.redirect('/dashboard');
    }
  });
});



module.exports = router;

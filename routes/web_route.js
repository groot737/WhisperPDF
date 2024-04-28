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
const fetch = require('isomorphic-fetch')
const upload = multer({ dest: 'uploads/' });
const {transporter, emailOption} = require('../config/nodemailer-config')
const {verifyMiddleware} = require('../controllers/checkverify')
const {securityMiddleware} = require('../controllers/checksecurity')
require('dotenv').config();

router.get('/', async (req, res) => {
  try {
    const books = await prisma.pdfBook.findMany();
    res.render('index', { books })
  } catch (error) {
    console.error('Error during search:', error);
    res.status(500).json({ error: 'Error during search' });
  }
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

// dashboard endpoint
router.get('/dashboard', adminMiddleware, verifyMiddleware, securityMiddleware, async (req, res) => {
  const currentUrl = `${req.protocol}://${req.get('host')}`;

  try {
    const response = await fetch(`${currentUrl}/user-data/${req.user.id}`);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const data = await response.json();
    const user = data.user;
    res.render('dashboard', { user });
  } catch (error) {
    console.error('Error fetching user data:', error);
    // Handle the error as needed, such as rendering an error page or redirecting
    res.status(500).send('Internal Server Error');
  }
});

// ============= UPLOAD PDF BOOKS ==================
router.get('/upload-book', adminMiddleware, (req, res) => {
  res.render('pdf')
})

// ============ PASSWORD FORGET ====================
router.get('/forget', (req, res) => {
  res.render('recovery/forget')
})

router.post('/forget', async(req, res) => {
  const {email} = req.body
  const user = await prisma.users.findUnique({
    where: {email: email}
  })
  if(user){
    const id = req.sessionID
    await prisma.users.update({
      where: {id: user['id']},
      data: {session_id: id}
    })
    emailOption['to'] = user.email
    emailOption['subject'] = 'Recover password'
    emailOption['text'] = `${req.protocol}://${req.get('host')}/forget/${id}`
    transporter.sendMail(emailOption)
  } else {
    res.send('user does not exist')
  }
})

router.get('/forget/:id', async (req, res) => {
  try {
      const user = await prisma.users.findFirst({
          where: { session_id: req.params.id },
      });

      if (user) {
          res.render('recovery/change_password');
      } else {
          res.send('User does not exist');
      }
  } catch (error) {
      console.error('Error retrieving user:', error);
      res.status(500).send('Internal Server Error');
  }
});

router.post('/change-password', async (req, res) => {
  try {
      let { password,id } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);

      await prisma.users.update({
          where: { session_id: id },
          data: { password: hashedPassword, session_id: null },
      });
      res.send('Password changed successfully');
  } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).send('Internal Server Error');
  }
});

// ============ EMAIL VERIFY ========================
router.get('/activate/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const user = await prisma.users.findUnique({
      where: { session_id: id }
    });

    if (!user) {
      return res.send('User not found');
    }

    await prisma.users.update({
      where: { id: user.id },
      data: { isVerified: true }
    });

    req.login(user, (err) => {
      if (err) {
        return res.render('404');
      }
      res.redirect('/dashboard');
    });
  } catch (error) {
    console.error('Error activating user:', error);
    res.send('Internal server error');
  }
});

//  =============== AUTHORIZE USER WITH GOOGLE OAUTH =================
router.get('/auth/google/', passport.authenticate('google', {
  scope: ['profile', 'email'],
  prompt: 'select_account'
}));

router.get('/auth/google/callback', passport.authenticate('google', {
  successRedirect: '/dashboard', 
  failureRedirect: '/register'  
}));

// ================ HANDLE NON MATCHING PAGES ====================//
router.use((req, res, next) => { 
  res.render('404')
}) 
module.exports = router;

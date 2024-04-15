const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { createUser } = require('../config/dbfunction/register');
const bcrypt = require('bcrypt');
const passport = require('../config/passport-config');
const {createUserFolders} = require('../config/cloudfunction/createUserFolder')
const AWS = require('aws-sdk');
const {authMiddleware, adminMiddleware} = require('../controllers/checkuser')

router.get('/', (req, res) => {
  res.send('Whisperpdf is the future biggest open source pdf library')
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

//============= LOG OUT USER =============
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
router.get('/dashboard', adminMiddleware, (req, res) => {
    res.render('dashboard')
})

module.exports = router;

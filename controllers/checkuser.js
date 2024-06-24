const passport = require('../config/passport-config');
const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fetch = require('isomorphic-fetch');
const userAgent = require('user-agent');
const { User } = require('../config/mongodb');
const { transporter, emailOption } = require('../config/nodemailer-config')
const bcrypt = require('bcrypt')
const io = global.io;
require('dotenv').config();

// if user is not authorized, redirect to login
const adminMiddleware = (req, res, next) => {
  if (req.isAuthenticated()) {
    next();
  } else {
    res.redirect('/login')
  }
};

// if user authorized block login and register
const authMiddleware = (req, res, next) => {
  if (req.isAuthenticated()) {
    res.redirect('/dashboard')
  } else {
    next()
  }
}

const securityMiddleware = async (req, res, next) => {
  const email = req.body.email;
  const password = req.body.password;

  try {
    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).send({ message: 'Incorrect email or password.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).send({ message: 'Incorrect email or password.' });
    }

    const security = await prisma.users.findUnique({
      where: {
        email: email
      },
      select: {
        id: true,
        securityEnabled: true
      }
    });

    if (security.securityEnabled) {
      console.log(security)
      const ua = userAgent.parse(req.headers['user-agent']);
      try {
        const result = await fetch('http://www.geoplugin.net/json.gp?ip=');
        const data = await result.json();
        //generate secure random number for requestCode
        const min = 1000000000;
        const max = 9999999999;
        const random10DigitNumber = crypto.randomInt(min, max + 1);

        const userData = new User({
          sessionId: req.sessionID,
          userId: user.id,
          deviceName: ua.full,
          ipAddress: data["geoplugin_request"],
          requestCode: random10DigitNumber,
          allowance: "waiting"
        });
        await userData.save();
        emailOption['to'] = user.email
        emailOption['subject'] = 'Login alert'
        emailOption['text'] = `someone tried to log in your account.\nDetails:\ndevice:${ua.full}\nIp:${data["geoplugin_request"]}\nyou can accept or decline request via this url: ${process.env.DOMAIN +  random10DigitNumber}`
        transporter.sendMail(emailOption, (err) =>{
          if(err){
            res.redirect('/login')
          }
          res.redirect(`/wait?id=${req.sessionID}`)
        })

      } catch (error) {
        console.error('Error saving userData:', error);
      }
    } else {
      passport.authenticate('local', {
        successRedirect: '/dashboard',
        failureRedirect: '/login',
        failureFlash: true
      })(req, res, next);
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send({ message: 'Internal server error.' });
  }
};

module.exports = { authMiddleware, adminMiddleware, securityMiddleware };

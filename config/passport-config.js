const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid')
const prisma = new PrismaClient();
require('dotenv').config();

passport.use(
  new LocalStrategy({ usernameField: 'email', passReqToCallback: true }, async (req, email, password, done) => {
    try {
      const user = await prisma.users.findUnique({ where: { email } });

      if (!user) {
        return done(null, false, { message: 'Incorrect email or password.' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return done(null, false, { message: 'Incorrect email or password.' });
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.callbackURL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const user = await prisma.users.findUnique({ where: { email: profile.emails[0].value } });

      if (!user) {
        const newUser = await prisma.users.create({
          data: {
            email: profile.emails[0].value,
            full_name: profile.displayName,
            isVerified: true,
            password: uuidv4()
          }
        });
        return done(null, newUser);
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id); 
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.users.findUnique({ where: { id: parseInt(id) } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

passport.use(
  new LocalStrategy({ usernameField: 'email', passReqToCallback: true }, async (req, email, password, done) => {
    try {
      const user = await prisma.users.findUnique({ where: { email } });

      if (!user) {
        // req.flash('error', 'Incorrect email.');
        return done(null, false, { message: 'Incorrect email.' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        req.flash('error', 'Incorrect password.');
        return done(null, false, { message: 'Incorrect password.' });
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

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

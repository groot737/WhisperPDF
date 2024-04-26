const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// check if user is verified
const verifyMiddleware = async (req, res, next) => {
  if (req.user.isVerified) {
    next();
  } else {
    res.send('Verify email before accessing dashboard'); 
    return; 
  }
};

module.exports = {verifyMiddleware}
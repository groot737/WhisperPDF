
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
    if(req.isAuthenticated()){
        res.redirect('/dashboard')
    } else{
        next()
    }
}
module.exports = {authMiddleware, adminMiddleware};
  
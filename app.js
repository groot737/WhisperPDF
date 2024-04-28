const express          = require('express')
const app              = express()
const mainRoute        = require('./routes/web_route.js')
const bookRoute        = require('./routes/book_route.js')
const userRoute        = require('./routes/user_route.js')
const ejs              = require('ejs')
const path             = require('path')
const { PrismaClient } = require('@prisma/client');
const session          = require('express-session')
const passport         =require('passport')
const flash            = require('express-flash');
const prisma           = new PrismaClient();

app.use(express.json())
app.set('view engine', 'ejs')
app.use(express.static('public'))
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({extended: true}))
app.use(session({ secret: 'your_secret_key', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// routes
app.use('/', mainRoute, userRoute)
app.use('/book', bookRoute)

// listen server
app.listen(3000)
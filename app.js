const express               = require('express');
const app                   = express();
const ejs                   = require('ejs');
const path                  = require('path');
const { PrismaClient }      = require('@prisma/client');
const session               = require('express-session');
const passport              = require('passport');
const flash                 = require('express-flash');
const http                  = require('http');
const server                = http.createServer(app); // Create server using http module
const { Server }            = require("socket.io");
const io                    = new Server(server);
const prisma                = new PrismaClient();
global.io = io;
const mainRoute             = require('./routes/web_route.js');
const bookRoute             = require('./routes/book_route.js');
const userRoute             = require('./routes/user_route.js');
const reviewRoute           = require('./routes/review_route.js')
const favouritesRoute       = require('./routes/favourites_route')
const bookListRoute         = require('./routes/booklist_route')

app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'your_secret_key', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use('/', mainRoute, userRoute);
app.use('/book', bookRoute);
app.use('/review', reviewRoute);
app.use('/favourites', favouritesRoute)
app.use('/booklist', bookListRoute)


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

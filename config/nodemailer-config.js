const nodemailer = require('nodemailer')
require('dotenv').config()

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_LOGIN,
        pass: process.env.EMAIL_PASS
    }
})

const emailOption = {
    from: "giorgiquchuloria7@gmail.com",
    to: "",
    subject: "",
    text: ""
};

module.exports = {transporter, emailOption}
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
const {transporter, emailOption} = require('../config/nodemailer-config')
require('dotenv').config();

const upload = multer({ dest: 'uploads/' });

//============= USER CRUD ================//

// =========== CREATE ====================//
router.post('/register', async (req, res) => {
    try {
        const { full_name, email, password } = req.body;
        const existingUser = await prisma.users.findUnique({
            where: { email: email },
        });

        if (existingUser) {
            req.flash('error', 'User with that email already exists.');
            return res.redirect('/register');
        }

        const newUser = await createUser(full_name, email, password);

        createUserFolders(newUser.id)
            .then(async () => {
                await prisma.users.update({
                    where: { email: email },
                    data: { session_id: req.sessionID }
                });
                emailOption['subject'] = 'Email activation'
                emailOption['to'] = email
                emailOption['text'] = `Your email activation: ${req.protocol}://${req.get('host')}/activate/${req.sessionID}`

                transporter.sendMail(emailOption);
                res.send('Activate your email to finish registration.');
            })
            .catch((err) => {
                console.error('Error creating user folders:', err);
                req.flash('error', 'Internal server error.');
                res.redirect('/register');
            });
    } catch (error) {
        console.error('Error registering user:', error);
        req.flash('error', 'Internal server error.');
        res.redirect('/register');
    }
});


//================ READ  =========================//
router.get('/user-data/:id', async (req, res) => {
    try {
        const user = await prisma.users.findUnique({
            where: {
                id: +req.params.id,
            },
        });

        if (!user) {
            throw new Error('User not found.');
        }

        res.status(200).json({ user });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }

})

// ================ UPDATE =======================//
router.post('/upload', upload.single('file'), async (req, res) => {
    const { fullname, bio } = req.body;

    try {
        if (fullname.trim().length !== 0) {
            await prisma.users.update({
                where: { id: req.user.id },
                data: { full_name: fullname.trim() },
            });
        }

        if (bio.trim().length !== 0) {
            await prisma.users.update({
                where: { id: req.user.id },
                data: { about: bio.trim() },
            });
        }
    } catch (updateError) {
        console.error('Error updating user data:', updateError);
        req.flash('error', 'Failed to update user data');
        res.redirect('/dashboard');
        return;
    }

    // Check if file was uploaded
    if (!req.file) {
        return res.redirect('/dashboard');
    }

    // Upload file
    const fileContent = fs.readFileSync(req.file.path);
    const params = {
        Bucket: process.env.BUCKET,
        Key: `${req.user.id}/avatar.png`, // Always upload with the same key (filename)
        Body: fileContent,
    };

    s3.upload(params, async (err, uploadData) => {
        if (err) {
            console.error('Error uploading file to S3:', err);
            req.flash('error', 'Failed to upload image');
            return res.redirect('/dashboard');
        }
        fs.unlinkSync(req.file.path); // Delete file from /uploads

        try {

            const updatedUser = await prisma.users.update({
                where: { id: req.user.id },
                data: { profile_pic: uploadData.Location },
            });

            req.flash('success', 'Image uploaded and user data updated successfully');
            res.redirect('/dashboard');
        } catch (updateError) {
            console.error('Error updating user data:', updateError);
            req.flash('error', 'Failed to update user data');
            res.redirect('/dashboard');
        }
    });
});

// ==================== DELETE =================// 
router.post('/delete-account', async (req, res) => {
    try {
        await prisma.pdfBook.deleteMany({
            where: { uploader_id: req.user.id },
        });

        await prisma.users.delete({
            where: { id: req.user.id },
        });

        const listParams = {
            Bucket: process.env.BUCKET,
            Prefix: `${req.user.id}/`,
        };
        s3.listObjectsV2(listParams, async (err, data) => {
            if (err) {
                console.error('Error listing objects in S3:', err);
                req.flash('error', 'Failed to delete user account');
                return res.redirect('/dashboard');
            }

            const objectsToDelete = data.Contents.map(obj => ({ Key: obj.Key }));
            if (objectsToDelete.length > 0) {
                const deleteParams = {
                    Bucket: process.env.BUCKET,
                    Delete: {
                        Objects: objectsToDelete,
                    },
                };
                s3.deleteObjects(deleteParams, (delErr, delData) => {
                    if (delErr) {
                        console.error('Error deleting objects in S3:', delErr);
                        req.flash('error', 'Failed to delete user account');
                        return res.redirect('/dashboard');
                    }

                    req.logout((logoutErr) => {
                        if (logoutErr) {
                            console.error('Error ending user session:', logoutErr);
                        }
                        req.flash('success', 'User account deleted successfully');
                        res.redirect('/');
                    });
                });
            } else {
                req.logout((logoutErr) => {
                    if (logoutErr) {
                        console.error('Error ending user session:', logoutErr);
                    }
                    req.flash('success', 'User account deleted successfully');
                    res.redirect('/');
                });
            }
        });
    } catch (error) {
        console.error('Error deleting user account:', error);
        req.flash('error', 'Failed to delete user account');
        res.redirect('/dashboard');
    }
});

module.exports = router
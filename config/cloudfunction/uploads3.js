const fs = require('fs');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const s3 = new AWS.S3();

const uploadToS3 = (userId, folderName, fileName, filePath) => {
  return new Promise((resolve, reject) => {
    const params = {
      Bucket: process.env.BUCKET,
      Key: `${userId}/${folderName}/${fileName}`,
      Body: fs.createReadStream(filePath),
    };
    s3.upload(params, (err, data) => {
      if (err) reject(err);
      else resolve(data.Location); 
    });
  });
};

module.exports = {uploadToS3};
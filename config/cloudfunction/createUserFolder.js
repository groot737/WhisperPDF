const AWS = require('aws-sdk');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
require('dotenv').config();

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.endpoint, 
});


const bucketName = process.env.BUCKET;

async function createUserFolders(userId) {
  const userFolder = `${userId}/`;
  const childFolders = ['covers/', 'pdfs/'];

  try {
    await Promise.all(
      childFolders.map(async (childFolderName) => {
        const childFolderParams = {
          Bucket: bucketName,
          Key: userFolder + childFolderName,
        };

        await s3.putObject(childFolderParams).promise();
        console.log('Child folder created successfully:', childFolderName);
      })
    );

    console.log('User folders created successfully.');
  } catch (error) {
    console.error('Error creating user folders:', error);
    throw error;
  }
}



module.exports = { createUserFolders, s3 };

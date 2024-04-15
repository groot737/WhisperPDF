const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt')

async function createUser(full_name, email, password) {
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const newUser = await prisma.users.create({
      data: {
        full_name,
        email,
        password: hashedPassword,
      },
    });

    console.log('User created:', newUser);
    return newUser;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { createUser };

import { PrismaClient } from "@prisma/client";

// 1. Declare the global variable for the Prisma instance
const prisma = global.prisma || new PrismaClient();

// 2. In development, save the instance to the global object
// This prevents hot-reloading from creating new connections every time you save a file
if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
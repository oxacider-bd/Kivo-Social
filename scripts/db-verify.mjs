import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const id = process.argv[2];
const post = id ? await db.post.findUnique({ where: { id }, select: { id: true, content: true, authorId: true, createdAt: true } }) : null;
console.log("ROW_IN_KIVO_POSTS:", post ? JSON.stringify({ id: post.id, content: post.content, createdAt: post.createdAt.toISOString() }) : "NOT FOUND");
console.log("TOTAL_POSTS:", await db.post.count());
await db.$disconnect();

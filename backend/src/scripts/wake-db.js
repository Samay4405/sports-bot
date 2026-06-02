import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + (process.env.DATABASE_URL.includes("?") ? "&" : "?") + "connect_timeout=30"
    }
  }
});

async function wakeDb() {
  const maxRetries = 5;
  const retryDelayMs = 3000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[wake-db] Attempt ${attempt} to connect to the database...`);
      // A simple query to ensure the DB is awake and responsive
      await prisma.$queryRaw`SELECT 1 as result`;
      console.log("[wake-db] Database is awake and responding.");
      return;
    } catch (error) {
      console.error(`[wake-db] Attempt ${attempt} failed:`, error.message);
      if (attempt < maxRetries) {
        console.log(`[wake-db] Waiting ${retryDelayMs / 1000} seconds before retrying...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        console.error("[wake-db] Max retries reached. Database failed to wake up.");
        process.exit(1);
      }
    }
  }
}

wakeDb().finally(() => prisma.$disconnect());

const redis = require('redis');

const redisUrl = process.env.REDIS_URI;

// Create a client, but don't connect yet.
const redisClient = redis.createClient({
  url: redisUrl
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis is connecting...'));
redisClient.on('ready', () => console.log('Redis is ready!'));
redisClient.on('end', () => console.log('Redis connection closed.'));

// A function that connects to Redis.
// We will call this once at server startup.
const connectRedis = async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    // If we can't connect to Redis, the app is non-functional.
    process.exit(1);
  }
};

// Export the single client instance and the connect function.
module.exports = { redisClient, connectRedis };
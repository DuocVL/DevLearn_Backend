const redis = require('redis');

// Get the Redis connection URL from environment variables
const redisUrl = process.env.REDIS_URI;

// Create a Redis client.
// It will use the provided URL if it exists, otherwise it will try to connect to the default localhost.
const redisClient = redis.createClient({
  url: redisUrl
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

// Connect to Redis
(async () => {
  await redisClient.connect();
  console.log('Connected to Redis');
})();

module.exports = redisClient;

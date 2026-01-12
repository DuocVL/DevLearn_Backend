const redis = require('redis');

const redisUrl = process.env.REDIS_URI;

const createRedisClient = () => {
  const client = redis.createClient({ url: redisUrl });
  client.on('error', err => console.error('Redis Client Error', err));
  return client;
};

const redisClient = createRedisClient();       // cho API
const redisWorkerClient = createRedisClient(); // cho worker

const connectRedis = async () => {
  await redisClient.connect();
  await redisWorkerClient.connect();
  console.log('Redis clients connected ✅');
};

module.exports = { redisClient, redisWorkerClient, connectRedis };

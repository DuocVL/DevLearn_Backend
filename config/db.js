const mongoose = require('mongoose');

const connectDB = async () => {
    await mongoose.connect(process.env.MONGO_URI,{ dbName: 'DevLearn' })
            .then(() => console.log('✅ MongoDB connected'))
            .catch((err) => console.error('❌MongoDb error:', err));
};

module.exports = connectDB;

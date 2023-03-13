const db = require('mongoose');

const connectDb = async () => {
    try {
        console.log('connecting...')
        db.set("strictQuery", false);
        await db.connect(process.env.MONGODB_URL)
        console.log('MongoDB connected!')
    } catch (error) {
        console.log(error)
    }
}

module.exports = connectDb;
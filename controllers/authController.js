const bcrypt = require('bcrypt');
const User = require('../models/User');


const handleNewUser = async (req, res) => {
    const { username, email, password } = req.body;
    if(!username || !email || !password) {
        res.status(400).json(
            { 'message': "Username, Email, Password are required!"}
        );
    }
    try {
        //Kiểm tra trùng lặp
        const existsUsername = await User.findOne({ username });
        const existsEmail = await User.findOne({ email });
        if(existsUsername) return res.status(400).json({ 'message': "Username already used"});
        if(existsEmail) return res.status(400).json({ 'message': "Email already used"});
    } catch (err) { return res.status(500).json( { 'message': "Unable to connect to database"}); }  

    //Băm mật khẩu
    bcrypt.hash(password, 10, async (err, hash) => {
        if(err) { return next(err); }
        const newUser = await User.create({ provider: 'local', email: email, username: username, passwordHash: hash});
    });

    //Tạo token

};

module.exports = { handleNewUser };


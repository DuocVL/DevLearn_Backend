const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');
const bcrypt = require('bcryptjs');

//Local Strategy
passport.use(new LocalStrategy({ usernameField: 'email' },
    async (identifier, password, done) => {
        try {
            // Try to find by email first, then by username to allow login with either
            let user = await User.findOne({ email: identifier });
            if (!user) user = await User.findOne({ username: identifier });
            if(!user) return done(null, false, { message: 'Incorrect username or password!'});

            const isMatch = await bcrypt.compare(password, user.passwordHash);
            if(!isMatch) return done(null, false, { message: 'Incorrect username or password!'});
            
            return done(null, user);
        } catch (err) {
            return done(err);
        }
    }
));

//Google login
passport.use( new GoogleStrategy(
    {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.BASE_URL}/auth/google/callback`
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            var user = await User.findOne({ providerId: profile.id, provider: 'google' });
            if(!user){
                user = await User.create(
                    {
                        username: profile.displayName,
                        email: profile.emails[0].value,
                        provider: 'google',
                        providerId: profile.id
                    }
                );
            }
    
            return done(null,user);
        } catch (err) { return done(err); }
    }
));

//Github login
passport.use( new GitHubStrategy(
    {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: `${process.env.BASE_URL}/auth/github/callback`
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            var user = await User.findOne({ providerId: profile.id , provider: 'github' });
            if(!user){
                user = await User.create({
                    username: profile.displayName,
                    email: profile.emails,
                    provider: 'github',
                    providerId: profile.id
                });
            }
    
            return done(null, user);
        } catch (err) { return done(err); }
    }
));


module.exports = passport;



const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');

const transporter = nodemailer.createTransport({
    service: 'gamil',
    auth:{
        user: process.env.GMAIL,
        pass: process.env.GMAIL_PASSWORD,
    }
});

//Hàm dùng chung gửi email
async function sendEmail(to, subject, templateName, variables) {
    try {
        const filepath = path.join(__dirname, `../templates/${templateName}.html`);
        const source = fs.readFileSync(filepath, 'utf-8');
        const template = handlebars.compile(source);
        const html = template(variables);

        //Gửi email
        transporter.sendMail({
            from: `"DevLearn" <${process.env.GMAIL}>`,
            to,
            subject,
            html,
        });

        console.log(`✅ Email sent to ${to}: ${subject}`);
    } catch (err) {
        console.error('❌ Error sending email:', err.message);
    }
}

//Gửi email chứa mã reset mật khẩu
async function sendResetPasswordEmail(to, username, code) {
    await sendEmail(to, 'Đặt lại mật khẩu của bạn', 'reser_password',{
        username,
        code,
    });
}

module.exports = { sendResetPasswordEmail };
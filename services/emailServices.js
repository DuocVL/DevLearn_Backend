const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const handlebars = require('handlebars');

// Hàm để đọc và biên dịch template Handlebars
function compileTemplate(templateName, data) {
    const templatePath = path.join(__dirname, '../templates', `${templateName}.html`);
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const compiledTemplate = handlebars.compile(templateSource);
    return compiledTemplate(data);
}

// Cấu hình Nodemailer transporter - ví dụ sử dụng ethereal.email cho testing
// Trong sản xuất, bạn nên dùng dịch vụ như SendGrid, Mailgun hoặc Gmail
const createTransporter = async () => {
    // For testing with Ethereal
    // let testAccount = await nodemailer.createTestAccount();
    // return nodemailer.createTransport({
    //     host: "smtp.ethereal.email",
    //     port: 587,
    //     secure: false, 
    //     auth: {
    //         user: testAccount.user,
    //         pass: testAccount.pass,
    //     },
    // });

    // Cấu hình cho dịch vụ email thực tế của bạn
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
};

// Hàm gửi email chung
async function sendEmail(to, subject, templateName, data) {
    const transporter = await createTransporter();
    const htmlContent = compileTemplate(templateName, data);

    const info = await transporter.sendMail({
        from: '"Your App Name" <no-reply@yourapp.com>', // Thay đổi tên và email người gửi
        to: to,
        subject: subject,
        html: htmlContent,
    });

    console.log("Message sent: %s", info.messageId);
    // Preview URL for Ethereal
    // console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
}

// Gửi email chứa mã reset mật khẩu
async function sendResetPasswordEmail(to, username, code) {
    // SỬA LỖI: Tên template đã được sửa từ 'reser_password' thành 'reset_password'
    await sendEmail(to, 'Đặt lại mật khẩu của bạn', 'reset_password',{
        username,
        code,
    });
}

module.exports = { sendResetPasswordEmail };

import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  //   host: "host8.registrar-servers.com",
  host: "smtp.mail.me.com",
  port: 587,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

export const sendEmail = async (email, subject, text) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      cc: process.env.CCMAIL,
      subject: subject,
      text: text,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Message sent: ${info.messageId}`);
  } catch (error) {
    console.error(error);
  }
};

export const sendOtp = async (email, otp) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      cc: "hasan.arish@designdistrict.digital",
      subject: "Your OTP for verifying registration",
      text: `Your OTP is ${otp}. Please do not share your OTP with anyone !`,
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error(error);
    return error;
  }
};

export const passwordResetEmail = async (email, link) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      cc: "hasan.arish@designdistrict.digital",
      subject: "Password Reset OTP",
      text: `
      You have requested a password reset.
      <br>
      You can reset your password by clicking this link
      ${link}
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error(error);
    return error;
  }
};

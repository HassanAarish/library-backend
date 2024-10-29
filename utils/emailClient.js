import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  //   host: "host8.registrar-servers.com",
  host: "smtp.mail.me.com",
  port: 587,
  auth: {
    user: process.env.EMAIL || "horror_98@icloud.com",
    pass: process.env.PASSWORD || "yomj-vrte-somt-ykul",
  },
});

export const sendEmail = async (email, subject, text) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
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
      subject: "Your OTP for registration",
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

export const sendReminderEmail = async (contract) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL,
      to: contract.email,
      subject: "Contract Reminder",
      text: `Hello ${contract.firstName} ${contract.lastName},

This is a reminder regarding your contract with us. Please note that the contract is effective starting on ${contract.effectiveDate.toDateString()}.

Thank you for your attention!

Best regards,
Stitched Together Studios
    `,
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error("🚀 ~ Error sending Email: ", error);
    return next(error);
  }
};

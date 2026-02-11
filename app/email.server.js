import nodemailer from 'nodemailer';

// Configure the transporter with your Gmail credentials
// IMPORTANT: Use environment variables for security in production!
const transporter = nodemailer.createTransport({
  service: 'gmail', // This tells Nodemailer to use Gmail's SMTP settings
  auth: {
    user: process.env.EMAIL_USER,         // Your Gmail address
    pass: process.env.EMAIL_APP_PASSWORD  // The generated App Password from Step 1
  }
});

/**
 * Sends an email using the configured Nodemailer transporter.
 * @param {object} options - Email options.
 * @param {string} options.to - Recipient email address(es).
 * @param {string} options.subject - Subject line of the email.
 * @param {string} [options.text] - Plain text content of the email.
 * @param {string} [options.html] - HTML content of the email (optional, will fall back to text if not provided).
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>} - Result of the email sending.
 */
export async function sendEmail({ to, subject, text, html }) {
  const mailOptions = {
    from: process.env.EMAIL_USER, // Sender address (your Gmail)
    to,                           // Recipient(s)
    subject,                      // Subject
    text,                         // Plain text body
    html                          // HTML body
  };

  try {
    console.log(`Attempting to send email to ${to} with subject: "${subject}"`);
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully! Message ID: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: error.message };
  }
}

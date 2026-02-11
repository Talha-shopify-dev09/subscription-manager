import * as SibApiV3Sdk from '@getbrevo/brevo';

let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
let apiKey = apiInstance.authentications['apiKey'];
apiKey.apiKey = process.env.BREVO_API_KEY;

/**
 * Sends an email using the Brevo (formerly Sendinblue) service.
 * @param {object} options - Email options.
 * @param {string} options.to - Recipient email address.
 * @param {string} options.from - Sender email address. Must be a verified sender in Brevo.
 * @param {string} options.subject - Subject line of the email.
 * @param {string} [options.text] - Plain text content of the email.
 * @param {string} [options.html] - HTML content of the email (optional).
 * @returns {Promise<{success: boolean, id?: string, error?: string}>} - Result of the email sending.
 */
export async function sendEmail({ to, from, subject, text, html }) {
  if (!from) {
    from = process.env.BREVO_FROM_EMAIL || 'no-reply@example.com';
    console.warn(`'from' address not provided, defaulting to ${from}. Ensure this is a verified sender in Brevo.`);
  }

  const sendSmtpEmail = {
    sender: { email: from },
    to: [{ email: to }],
    subject: subject,
    textContent: text,
    htmlContent: html,
  };

  try {
    console.log(`Attempting to send email to ${to} from ${from} with subject: "${subject}"`);
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);

    if (data && data.messageId) {
      console.log('Email sent successfully! Message ID:', data.messageId);
      return { success: true, id: data.messageId };
    } else {
      console.error('Failed to send email: No message ID received from Brevo.', data);
      return { success: false, error: 'No message ID received from Brevo.' };
    }
  } catch (error) {
    console.error('Failed to send email:', error.response ? error.response.text : error.message);
    return { success: false, error: error.response ? error.response.text : error.message };
  }
}

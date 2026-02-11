import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends an email using the Resend service.
 * @param {object} options - Email options.
 * @param {string} options.to - Recipient email address(es).
 * @param {string} options.from - Sender email address. Must be a verified sender in Resend.
 * @param {string} options.subject - Subject line of the email.
 * @param {string} [options.text] - Plain text content of the email.
 * @param {string} [options.html] - HTML content of the email (optional).
 * @returns {Promise<{success: boolean, id?: string, error?: string}>} - Result of the email sending.
 */
export async function sendEmail({ to, from, subject, text, html }) {
  if (!from) {
    // Default to the first verified email from the environment if not explicitly provided
    from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'; // Fallback to Resend's default
    console.warn(`'from' address not provided, defaulting to ${from}. Ensure this is a verified sender in Resend.`);
  }

  try {
    console.log(`Attempting to send email to ${to} from ${from} with subject: "${subject}"`);
    const { data, error } = await resend.emails.send({
      from: from,
      to: to,
      subject: subject,
      text: text,
      html: html,
    });

    if (error) {
      console.error('Failed to send email:', error);
      return { success: false, error: error.message };
    }

    console.log('Email sent successfully! ID: %s', data.id);
    return { success: true, id: data.id };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: error.message };
  }
}


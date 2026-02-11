import * as SibApiV3Sdk from '@getbrevo/brevo';

let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
let apiKey = apiInstance.authentications['apiKey'];

export async function sendEmail({ to, from, subject, text, html }) {
  // Ensure API Key is set
  if (!process.env.BREVO_API_KEY) {
    console.error('Brevo API Key is not set in environment variables (BREVO_API_KEY). Email will not be sent.');
    return { success: false, error: 'Brevo API Key is not configured.' };
  }
  apiKey.apiKey = process.env.BREVO_API_KEY; // Set API key here, after the check

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
      console.error('Failed to send email: No message ID received from Brevo or API returned an unexpected response.', data);
      return { success: false, error: 'Brevo API did not return a message ID.' };
    }
  } catch (error) {
    let errorMessage = 'An unknown error occurred while sending email via Brevo.';
    if (error.response) {
      // Brevo SDK errors often have error.response.body and error.response.status
      try {
        const errorBody = JSON.parse(error.response.text);
        errorMessage = `Brevo API Error (${error.response.status}): ${errorBody.message || error.response.text}`;
      } catch (jsonParseError) {
        errorMessage = `Brevo API Error (${error.response.status}): ${error.response.text}`;
      }
    } else if (error.message) {
      errorMessage = `Brevo client Error: ${error.message}`;
    }
    console.error('Failed to send email:', errorMessage, error);
    return { success: false, error: errorMessage };
  }
}

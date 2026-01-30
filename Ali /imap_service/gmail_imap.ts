import { ImapFlow } from 'imapflow';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const host = 'imap.gmail.com';
const port = 993;
const user = process.env.DOC_EMAIL || '';
const password = process.env.EMAIL_APP_PASSWORD || '';

/**
 * Fetches the latest 2FA code from Gmail using IMAP.
 * @param timeoutSeconds - How long to wait for the email to arrive (polling).
 * @param sinceTime - Optional timestamp. Only emails received AFTER this time will be considered.
 * @returns {Promise<string | null>} The 6-digit verification code or null if not found.
 */
export async function getGmail2FACode(timeoutSeconds = 60, sinceTime?: number): Promise<string | null> {
    const startTime = Date.now();
    const expiryTime = startTime + (timeoutSeconds * 1000);
    const effectiveSinceTime = sinceTime || (startTime - 30000); // Default to last 30 seconds if not provided

    console.log(`Polling for 2FA code from Gmail (up to ${timeoutSeconds}s)...`);
    console.log(`Looking for emails received after: ${new Date(effectiveSinceTime).toLocaleTimeString()}`);

    while (Date.now() < expiryTime) {
        const client = new ImapFlow({
            host,
            port,
            secure: true,
            auth: {
                user,
                pass: password
            },
            logger: false
        });

        try {
            await client.connect();
            const lock = await client.getMailboxLock('INBOX');
            try {
                // Search for emails from support@doctornow.io
                const messages = await client.search({
                    from: 'support@doctornow.io',
                    subject: 'DocNow | 2-Factor Authentication Code'
                });

                if (messages && messages.length > 0) {
                    // Start from the most recent and go backwards
                    for (let i = messages.length - 1; i >= 0; i--) {
                        const latestUid = messages[i];
                        const message = await client.fetchOne(latestUid, { source: true, envelope: true });

                        if (message && message.envelope && message.source) {
                            const emailDate = message.envelope.date;
                            if (emailDate) {
                                const emailTime = new Date(emailDate).getTime();

                                // CHECK: Is this email newer than when we started the search?
                                if (emailTime >= effectiveSinceTime) {
                                    const content = message.source.toString();
                                    const codeMatches = content.match(/\b\d{6}\b/g);

                                    if (codeMatches) {
                                        // Filter out the placeholder '000000'
                                        const validCodes = codeMatches.filter(code => code !== '000000');
                                        if (validCodes.length > 0) {
                                            const code = validCodes[validCodes.length - 1];
                                            console.log(`Bingo! Found latest code: ${code} (Email date: ${new Date(emailTime).toLocaleTimeString()})`);
                                            return code;
                                        }
                                    }
                                } else {
                                    // Since we are going backwards, if this one is too old, all subsequent ones are too old
                                    break;
                                }
                            }
                        }
                    }
                }
            } finally {
                lock.release();
            }
            await client.logout();
        } catch (error) {
            console.error('IMAP Polling Error:', error);
            try { await client.logout(); } catch (e) { }
        }

        // Wait 5 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    console.log('Timeout reached: No fresh 2FA email found.');
    return null;
}

import { ImapFlow } from 'imapflow';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const host = 'imap.gmail.com';
const port = 993;
const user = process.env.DOC_EMAIL || '';
const password = process.env.EMAIL_APP_PASSWORD || '';

async function inspectLatestEmail() {
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
            const messages = await client.search({
                from: 'support@doctornow.io',
                subject: 'DocNow | 2-Factor Authentication Code'
            });

            if (messages && messages.length > 0) {
                const latestUid = messages[messages.length - 1];
                const msg = await client.fetchOne(latestUid, { source: true, envelope: true });
                if (msg && msg.source) {
                    const content = msg.source.toString();
                    console.log('--- ENVELOPE ---');
                    console.log(`Date: ${msg.envelope.date}`);
                    console.log(`Subject: ${msg.envelope.subject}`);
                    console.log('--- CONTENT START ---');
                    console.log(content);
                    console.log('--- CONTENT END ---');

                    const codeMatches = content.match(/\b\d{6}\b/g);
                    console.log('All 6-digit matches found:', codeMatches);
                }
            } else {
                console.log('No matching emails found.');
            }
        } finally {
            lock.release();
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.logout();
    }
}

inspectLatestEmail();

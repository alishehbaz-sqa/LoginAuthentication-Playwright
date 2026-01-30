import { ImapFlow } from 'imapflow';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const host = 'imap.gmail.com';
const port = 993;
const user = process.env.DOC_EMAIL || '';
const password = process.env.EMAIL_APP_PASSWORD || '';

async function debugInbox() {
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
            const messages = await client.search({});
            if (messages && messages.length > 0) {
                const lastMessages = messages.slice(-5);
                console.log(`Found ${messages.length} messages. Top 5 latest:`);

                for (const uid of lastMessages.reverse()) {
                    const msg = await client.fetchOne(uid, { envelope: true, source: true });
                    if (msg && msg.envelope) {
                        console.log('-------------------');
                        console.log(`Date: ${msg.envelope.date}`);
                        console.log(`From: ${msg.envelope.from[0]?.address}`);
                        console.log(`Subject: ${msg.envelope.subject}`);
                    }
                }
            } else {
                console.log('No messages found.');
            }
        } finally {
            lock.release();
        }
    } catch (error) {
        console.error('Debug Error:', error);
    } finally {
        await client.logout();
    }
}

debugInbox();

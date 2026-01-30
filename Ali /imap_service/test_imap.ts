import { getGmail2FACode } from './gmail_imap';

async function testConnection() {
    console.log('Testing Gmail IMAP connection...');
    const code = await getGmail2FACode();
    if (code) {
        console.log('SUCCESS: Latest 2FA code found:', code);
    } else {
        console.log('NOTICE: Connection established, but no 6-digit code was detected in the latest email.');
    }
}

testConnection().catch(err => {
    console.error('Test failed:', err);
});

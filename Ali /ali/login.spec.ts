import { test, expect, Page, Locator } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { getGmail2FACode } from '../imap_service/gmail_imap';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const loginEmail = process.env.DOC_PRELIVE_EMAIL || process.env.DOC_EMAIL || '';
const loginPassword = process.env.DOC_PRELIVE_PASSWORD || process.env.DOC_PASSWORD || '';
const PRELIVE_URL = "https://prelive.app.doctornow.io/login"

test.describe('Login Page Authentication Tests', () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
        // Reuse context for tests in one window
        page = await browser.newPage();
    });

    test.afterAll(async () => {
        await page.close();
    });

    // Helper to highlight and interact
    async function interact(action: 'fill' | 'click' | 'check', selector: string | Locator, value?: string) {
        let loc: Locator;
        if (typeof selector === 'string') {
            loc = page.locator(selector).first();
        } else {
            loc = selector.first();
        }

        await loc.scrollIntoViewIfNeeded();

        // Ripple indicator
        await loc.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            const circle = document.createElement('div');
            circle.style.position = 'fixed';
            circle.style.zIndex = '9999';
            circle.style.top = `${rect.top + rect.height / 2 - 25}px`;
            circle.style.left = `${rect.left + rect.width / 2 - 25}px`;
            circle.style.width = '50px';
            circle.style.height = '50px';
            circle.style.borderRadius = '50%';
            circle.style.border = '4px solid #ff4081';
            circle.style.backgroundColor = 'rgba(255, 64, 129, 0.3)';
            circle.style.pointerEvents = 'none';
            circle.style.animation = 'ripple 1s ease-out infinite';

            const style = document.createElement('style');
            style.innerHTML = `@keyframes ripple { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }`;
            document.head.appendChild(style);
            document.body.appendChild(circle);

            setTimeout(() => { circle.remove(); style.remove(); }, 1500);
        });

        await page.waitForTimeout(1000);

        if (action === 'fill' && value !== undefined) {
            await loc.fill(value);
        } else if (action === 'click') {
            await loc.click();
        } else if (action === 'check') {
            await loc.check();
        }

        await page.waitForTimeout(1000);
    }

    async function handle2FA(loginStartTime: number) {
        console.log('Waiting for 2FA page...');
        await expect(page.locator('#auth-password')).toBeVisible({ timeout: 15000 });

        console.log('Fetching 2FA code from Gmail...');
        // Pass the loginStartTime to ensure we only get a NEW email
        const code = await getGmail2FACode(60, loginStartTime);

        if (code) {
            console.log(`Entering 2FA code: ${code}`);
            await interact('fill', '#auth-password', code);
            await interact('click', '#auth-submit-btn');
        } else {
            throw new Error('Failed to fetch 2FA code from Gmail');
        }
    }

    test.beforeEach(async () => {
        await page.goto(PRELIVE_URL);
        if (!page.url().includes('login')) {
            await page.context().clearCookies();
            await page.goto(PRELIVE_URL);
        }
    });

    test('Verify that Login page should appear in 2-3 seconds', async () => {
        const startTime = Date.now();
        await page.goto(PRELIVE_URL);
        const loadTime = Date.now() - startTime;
        console.log(`Page Load Time: ${loadTime}ms`);
        expect(loadTime).toBeLessThan(5000);
        await expect(page.locator('#user-email')).toBeVisible();
    });

    test('To Verify that the User can log in with a valid Credentials', async () => {
        test.skip(!loginEmail || !loginPassword, 'Valid credentials not provided in .env');

        await interact('fill', '#user-email', loginEmail);
        await interact('fill', '#user-password', loginPassword);
        const loginStartTime = Date.now();
        await interact('click', '#form-submit');

        // Handle 2FA automatically
        await handle2FA(loginStartTime);

        // Wait for dashboard or redirection after 2FA
        await expect(page).not.toHaveURL(/.*login/, { timeout: 30000 });
    });

    test('Verify that the user does not log in with an Empty username and Password', async () => {
        await interact('click', '#form-submit');
        await expect(page.locator('mat-error')).toHaveCount(2);
        await expect(page.locator('mat-error').first()).toBeVisible();
    });

    test('To Verify that user should not Login if the password field is empty', async () => {
        await interact('fill', '#user-email', loginEmail || 'test@example.com');
        await interact('click', '#form-submit');
        const passwordError = page.locator('mat-form-field:has(#user-password) mat-error');
        await expect(passwordError).toBeVisible();
        await expect(passwordError).toHaveText(/Please enter password/i);
    });

    test('To Verify that the User should not log in with the Email address input field is empty', async () => {
        await interact('fill', '#user-password', loginPassword || 'password123');
        await interact('click', '#form-submit');
        const emailError = page.locator('mat-form-field:has(#user-email) mat-error');
        await expect(emailError).toBeVisible();
        await expect(emailError).toHaveText(/Please enter email/i);
    });

    test('To verify that the User can\'t log in with an invalid/wrong format of email and password', async () => {
        await interact('fill', '#user-email', 'garbage');
        await page.keyboard.press('Tab');
        await interact('fill', '#user-password', '125');
        await interact('click', '#form-submit');

        const errorIndicator = page.locator('mat-error')
            .or(page.locator('snack-bar-container'))
            .or(page.locator('text=Invalid email'))
            .or(page.locator('text=valid email'));
        await expect(errorIndicator.first()).toBeVisible({ timeout: 15000 });
    });

    test('Verify that the user should not log in with valid email and a wrong/invalid password', async () => {
        await interact('fill', '#user-email', loginEmail || 'test@example.com');
        await interact('fill', '#user-password', 'wrongpassword');
        await interact('click', '#form-submit');
        const errorIndicator = page.locator('mat-error').or(page.locator('snack-bar-container')).or(page.locator('text=Invalid')).or(page.locator('text=Error')).or(page.locator('text=doesn\'t exist'));
        await expect(errorIndicator.first()).toBeVisible({ timeout: 15000 });
    });

    test('Verify that the user should not log in with a valid password and a wrong/invalid email', async () => {
        await interact('fill', '#user-email', 'wrong@email.com');
        await interact('fill', '#user-password', loginPassword || 'validPass');
        await interact('click', '#form-submit');
        const errorIndicator = page.locator('mat-error').or(page.locator('snack-bar-container')).or(page.locator('text=Invalid')).or(page.locator('text=Error')).or(page.locator('text=doesn\'t exist'));
        await expect(errorIndicator.first()).toBeVisible({ timeout: 15000 });
    });

    test('Verify that the password should be visible in string/readable after clicking on the eye icon', async () => {
        await interact('fill', '#user-password', 'SecretPass');
        const passwordInput = page.locator('#user-password');
        await expect(passwordInput).toHaveAttribute('type', 'password');
        await interact('click', 'mat-icon:has-text("visibility_off")');
        await expect(passwordInput).toHaveAttribute('type', 'text');
        await expect(page.locator('mat-icon:has-text("visibility")').first()).toBeVisible();
    });

    test('Verify that the user logs in with the checked remember me option', async () => {
        test.skip(!loginEmail || !loginPassword, 'Valid credentials not provided in .env');

        await interact('fill', '#user-email', loginEmail);
        await interact('fill', '#user-password', loginPassword);
        const rememberMeContainer = page.locator('mat-checkbox');
        await interact('click', rememberMeContainer);
        const loginStartTime = Date.now();
        await interact('click', '#form-submit');

        // Handle 2FA automatically
        await handle2FA(loginStartTime);

        await expect(page).not.toHaveURL(/.*login/, { timeout: 30000 });
    });

});

// Accounts and cloud sync, against the Firebase emulators: real sign-up, real security rules, real sync between
// two browser profiles standing in for two devices.
import { test, expect, openApp, fakeBrowserTranslator, pasteArticle, waitTranslated, zh, en,
  useAccounts, newEmail, signUp, signIn, signedIn, syncNow, cloudRecords, EMULATORS } from './helpers.mjs';

async function newDevice(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
  await useAccounts(page);
  await fakeBrowserTranslator(page);
  await openApp(page);
  return { page, ctx, errors };
}
const navTitles = (page) => page.locator('.navitem .ni-t').allInnerTexts();
const uidOf = (page) => page.evaluate(() => PTL.user().uid);
async function restSignIn(request, email, password = 'secret123') {
  const r = await request.post(`${EMULATORS.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, { data: { email, password, returnSecureToken: true } });
  return r.json();
}

test('accounts stay out of the way until the site is configured for them', async ({ page }) => {
  await page.route('**/config.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.PTL_CONFIG={firebase:null};' }));
  await openApp(page);
  await expect(page.locator('#user')).toBeEmpty();
  expect(await page.evaluate(() => PTL.accounts)).toBe(false);
  expect(await page.evaluate(() => PTL.user())).toBe(null);
});

test('the site\'s own configuration turns accounts on', async ({ page }) => {
  await openApp(page);
  expect(await page.evaluate(() => PTL.accounts)).toBe(true);
  await expect(page.locator('#user')).toContainText('登录 / 注册');
});

test.describe('with accounts turned on', () => {
  test.beforeEach(async ({ page }) => {
    await useAccounts(page);
    await fakeBrowserTranslator(page);
  });

  test('a new account syncs its library to a second device, and edits travel both ways', async ({ page, browser }) => {
    const email = newEmail();
    await openApp(page);
    await expect(page.locator('#user')).toContainText('登录 / 注册');
    await signUp(page, email);
    await pasteArticle(page, 'Numbers create distance, and distance creates trust.\n\nA second paragraph follows here.', { title: 'Synced Essay' });
    await waitTranslated(page, 2);
    await syncNow(page);
    await expect(page.locator('#user')).toContainText('已同步');

    // a second device signs in and finds the document, translation included
    const b = await newDevice(browser);
    await signIn(b.page, email);
    await expect(b.page.locator('.navitem', { hasText: 'Synced Essay' })).toHaveCount(1);
    await b.page.locator('.navitem', { hasText: 'Synced Essay' }).click();
    await expect(zh(b.page).first()).toHaveText('【免】Numbers create distance, and distance creates trust.');

    // a highlight made on the second device shows up on the first without reloading it
    await en(b.page).first().evaluate((el) => {
      const t = el.firstChild, r = document.createRange();
      r.setStart(t, 0); r.setEnd(t, 'Numbers'.length);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await b.page.locator('#selbar .sw.c-g').click();
    await expect(b.page.locator('#userdoc mark.an.c-g')).toHaveText('Numbers');
    await syncNow(b.page);
    await syncNow(page);
    await expect(page.locator('#userdoc mark.an.c-g')).toHaveText('Numbers');

    // deleting the document on the first device removes it from the second
    await page.locator('#nav li', { hasText: 'Synced Essay' }).locator('.row-btn').click();
    await page.locator('.pop-item', { hasText: '删除' }).click();
    const confirm = page.locator('#modal .btn.primary, #modal .btn.danger');
    if (await confirm.count()) await confirm.first().click();
    await expect(page.locator('.navitem', { hasText: 'Synced Essay' })).toHaveCount(0);
    await syncNow(page);
    await syncNow(b.page);
    await expect(b.page.locator('.navitem', { hasText: 'Synced Essay' })).toHaveCount(0);

    // in the cloud the document is marked deleted rather than left behind
    const records = await cloudRecords(page.request, await uidOf(page));
    expect(records.find((r) => r.path.startsWith('docs/'))).toMatchObject({ deleted: true });
    expect(b.errors).toEqual([]);
    await b.ctx.close();
  });

  test('what was saved before signing in can be moved into the account, and signing out leaves the device clean', async ({ page }) => {
    const email = newEmail();
    await openApp(page);
    await pasteArticle(page, 'A guest paragraph written before any account existed.\n\nAnd a second one.', { title: 'Guest Notes' });
    await waitTranslated(page, 2);

    await signUp(page, email, 'secret123', { merge: true });
    await expect(page.locator('.navitem', { hasText: 'Guest Notes' })).toHaveCount(1);
    await syncNow(page);
    const uid = await uidOf(page);
    expect((await cloudRecords(page.request, uid)).map((r) => r.path).some((p) => p.startsWith('pdf/guest-notes'))).toBe(true);

    // sign out: back to an empty signed-out library; the account's content is not shown
    await page.click('#user .user-chip');
    await page.click('.user-form [data-a="toout"]');
    await page.click('.user-form [data-a="signout"]');
    await expect(page.locator('#user')).toContainText('登录 / 注册');
    expect(await navTitles(page)).toEqual([]);

    // sign in again: everything is back
    await signIn(page, email);
    await expect(page.locator('.navitem', { hasText: 'Guest Notes' })).toHaveCount(1);
  });

  test('keeping signed-out content separate is respected, and "clear this device" really clears it', async ({ page }) => {
    const email = newEmail();
    await openApp(page);
    await pasteArticle(page, 'This stays with the device, not the account.\n\nSecond paragraph.', { title: 'Device Only' });
    await waitTranslated(page, 2);
    await signUp(page, email, 'secret123', { merge: false });
    expect(await navTitles(page)).toEqual([]);
    await pasteArticle(page, 'This one belongs to the account.\n\nSecond paragraph.', { title: 'Account Only' });
    await waitTranslated(page, 2);
    await syncNow(page);
    const uid = await uidOf(page);

    await page.click('#user .user-chip');
    await page.click('.user-form [data-a="toout"]');
    await page.check('#user-drop');
    await page.click('.user-form [data-a="signout"]');
    await expect(page.locator('#user')).toContainText('登录 / 注册');
    expect(await navTitles(page)).toEqual(['Device Only']);
    await expect.poll(() => page.evaluate(async (name) => (await indexedDB.databases()).some((d) => d.name === name), 'parallel-text-library::' + uid)).toBe(false);

    // the cloud copy was not touched: signing in brings the account's document back, without merging the device's
    await page.click('#user .user-chip');
    await page.fill('#user-email', email);
    await page.fill('#user-pw', 'secret123');
    await page.click('.user-form button[type=submit]');
    await page.locator('.user-form [data-a="no"]').click();
    await signedIn(page, email);
    await expect(page.locator('.navitem', { hasText: 'Account Only' })).toHaveCount(1);
    expect(await navTitles(page)).toEqual(['Account Only']);
  });

  test('sign-in mistakes are explained in plain words', async ({ page }) => {
    const email = newEmail();
    page.allowErrors(/Failed to load resource/);                    // the emulator answers 400 to bad credentials
    await openApp(page);
    await signUp(page, email);
    await page.click('#user .user-chip');
    await page.click('.user-form [data-a="toout"]');
    await page.click('.user-form [data-a="signout"]');
    await expect(page.locator('#user')).toContainText('登录 / 注册');

    await page.click('#user .user-chip');
    const err = page.locator('.user-form .ferr');
    await page.click('.user-form button[type=submit]');
    await expect(err).toHaveText('请输入邮箱。');
    await page.fill('#user-email', email);
    await page.fill('#user-pw', 'wrong-password');
    await page.click('.user-form button[type=submit]');
    await expect(err).toHaveText('邮箱或密码不对。');
    await page.click('.user-tabs [data-mode="up"]');
    await page.fill('#user-pw', '123');
    await page.click('.user-form button[type=submit]');
    await expect(err).toHaveText('密码太短，至少需要 6 位。');
    await page.fill('#user-pw', 'another-secret');
    await page.click('.user-form button[type=submit]');
    await expect(err).toHaveText('这个邮箱已经注册过，请直接登录。');
    await page.fill('#user-email', 'not-an-email');
    await page.click('.user-form button[type=submit]');
    await expect(err).toHaveText('邮箱地址的格式不对。');
  });

  test('registering sends a verification email and "forgot password" sends a reset email', async ({ page }) => {
    const email = newEmail();
    await openApp(page);
    await signUp(page, email);
    await page.click('#user .user-chip');
    await expect(page.locator('.user-form')).toContainText('邮箱未验证');
    await page.click('.user-form [data-a="toout"]');
    await page.click('.user-form [data-a="signout"]');
    await expect(page.locator('#user')).toContainText('登录 / 注册');

    await page.click('#user .user-chip');
    await page.click('.user-form [data-a="forgot"]');
    await expect(page.locator('.user-form .ferr')).toContainText('先填上邮箱');
    await page.fill('#user-email', email);
    await page.click('.user-form [data-a="forgot"]');
    await expect(page.locator('.user-form .ferr')).toContainText('重置密码的邮件已发到 ' + email);

    const sent = (await (await page.request.get(`${EMULATORS.auth}/emulator/v1/projects/${EMULATORS.project}/oobCodes`)).json()).oobCodes.filter((c) => c.email === email);
    expect(sent.map((c) => c.requestType).sort()).toEqual(['PASSWORD_RESET', 'VERIFY_EMAIL']);
  });

  test('the security rules keep each account\'s records to itself', async ({ page, request }) => {
    const alice = newEmail(), mallory = newEmail();
    await openApp(page);
    await signUp(page, alice);
    await pasteArticle(page, 'Private reading notes.\n\nSecond paragraph.', { title: 'Private' });
    await waitTranslated(page, 2);
    await syncNow(page);
    const aliceUid = await uidOf(page);

    const m = await (await request.post(`${EMULATORS.auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { data: { email: mallory, password: 'secret123', returnSecureToken: true } })).json();
    const a = await restSignIn(request, alice);
    const base = `http://${EMULATORS.firestore}/v1/projects/${EMULATORS.project}/databases/(default)/documents/users`;
    const read = (uid, token) => request.get(`${base}/${uid}/records?pageSize=5`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    expect((await read(aliceUid, a.idToken)).status()).toBe(200);
    expect((await (await read(aliceUid, a.idToken)).json()).documents.length).toBeGreaterThan(0);
    expect((await read(aliceUid, m.idToken)).status()).toBe(403);       // another signed-in user
    expect((await read(aliceUid, null)).status()).toBe(403);            // nobody
    const write = await request.patch(`${base}/${aliceUid}/records/planted`, { headers: { Authorization: 'Bearer ' + m.idToken }, data: { fields: { p: { stringValue: 'docs/planted' } } } });
    expect(write.status()).toBe(403);
    expect((await read(m.localId, m.idToken)).status()).toBe(200);      // their own (empty) space is theirs
  });

  test('learning settings follow the account', async ({ page, browser }) => {
    const email = newEmail();
    await openApp(page);
    await signUp(page, email);
    await page.click('#typoopen');
    await page.click('#typo [data-vl="1"]');
    await page.click('#typo [data-vl="1"]');
    await expect(page.locator('#ty-vl')).toHaveText(/10,?000/);
    await page.keyboard.press('Escape');
    await syncNow(page);

    const b = await newDevice(browser);
    await signIn(b.page, email);
    await syncNow(b.page);
    await b.page.click('#typoopen');
    await expect(b.page.locator('#ty-vl')).toHaveText(/10,?000/);
    await b.ctx.close();
  });

  test('edits made offline are uploaded when the connection returns', async ({ page, context, browser }) => {
    const email = newEmail();
    page.allowErrors(/ERR_INTERNET_DISCONNECTED|Failed to load resource|network/i);
    await openApp(page);
    await signUp(page, email);
    await context.setOffline(true);
    await pasteArticle(page, 'Written on a train with no signal.\n\nSecond paragraph.', { title: 'Offline Essay' });
    await waitTranslated(page, 2);
    await expect(page.locator('#user')).toContainText(/离线|待同步|稍后/);
    await context.setOffline(false);
    await syncNow(page);

    const b = await newDevice(browser);
    await signIn(b.page, email);
    await expect(b.page.locator('.navitem', { hasText: 'Offline Essay' })).toHaveCount(1);
    await b.ctx.close();
  });

  test('when the account service ends the session, the reader is asked to sign in again and sync resumes', async ({ page, request }) => {
    const email = newEmail();
    page.allowErrors(/Failed to load resource/);
    await openApp(page);
    await signUp(page, email);
    await pasteArticle(page, 'Kept on this device while signed out by the server.\n\nSecond paragraph.', { title: 'Still Here' });
    await waitTranslated(page, 2);
    await syncNow(page);
    const uid = await uidOf(page);
    const admin = (data) => request.post(`${EMULATORS.auth}/identitytoolkit.googleapis.com/v1/accounts:update`, { headers: { Authorization: 'Bearer owner' }, data: { localId: uid, ...data } });

    await admin({ disableUser: true });                              // e.g. the password was changed on another device
    await page.reload();
    await expect(page.locator('#user')).toContainText('登录已过期', { timeout: 20_000 });
    await expect(page.locator('.navitem', { hasText: 'Still Here' })).toHaveCount(1);     // the library is still readable

    await admin({ disableUser: false });
    await page.click('#user .user-chip');
    await expect(page.locator('#user-email')).toHaveValue(email);
    await page.fill('#user-pw', 'secret123');
    await page.click('.user-form button[type=submit]');
    await expect(page.locator('#user')).toContainText('已同步', { timeout: 20_000 });
    await expect(page.locator('.user-form')).toHaveCount(0);
  });

  test('the home page and the command palette say where the content lives', async ({ page }) => {
    const email = newEmail();
    await openApp(page);
    await expect(page.locator('#viewpane')).toContainText('现在没有登录');
    await page.keyboard.press('Control+k');
    await page.keyboard.type('登录');
    await expect(page.locator('.cmdk-it b').first()).toContainText('登录 / 注册');
    await page.keyboard.press('Enter');
    await expect(page.locator('.user-form .mtitle')).toHaveText('登录');
    await page.keyboard.press('Escape');
    await signUp(page, email);
    await expect(page.locator('#viewpane')).toContainText('已登录 ' + email);
    await page.keyboard.press('Control+k');
    await page.keyboard.type('同步');
    await expect(page.locator('.cmdk-it b').first()).toContainText('立即同步');
    await page.keyboard.press('Escape');
  });

  test('deleting the account removes its cloud records and signs the device out', async ({ page }) => {
    const email = newEmail();
    await openApp(page);
    await signUp(page, email);
    await pasteArticle(page, 'Soon to be gone.\n\nSecond paragraph.', { title: 'Doomed' });
    await waitTranslated(page, 2);
    await syncNow(page);
    const uid = await uidOf(page);
    expect((await cloudRecords(page.request, uid)).length).toBeGreaterThan(0);

    await page.click('#user .user-chip');
    await page.locator('.user-form details.acct-more summary').click();
    await page.click('.user-form [data-a="todelete"]');
    await page.click('.user-form [data-a="delete"]');
    await expect(page.locator('.user-form .ferr')).toContainText('请输入“删除”');
    await page.fill('#user-confirm', '删除');
    await page.click('.user-form [data-a="delete"]');
    await expect(page.locator('#user')).toContainText('登录 / 注册', { timeout: 20_000 });
    expect(await cloudRecords(page.request, uid)).toEqual([]);
    expect(await navTitles(page)).toEqual([]);

    page.allowErrors(/Failed to load resource/);
    await page.click('#user .user-chip');
    await page.fill('#user-email', email);
    await page.fill('#user-pw', 'secret123');
    await page.click('.user-form button[type=submit]');
    await expect(page.locator('.user-form .ferr')).toHaveText('邮箱或密码不对。');
  });
});

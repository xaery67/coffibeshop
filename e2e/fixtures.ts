import { test as base, expect, type Page } from '@playwright/test';

/** Akun seed (apps/api/prisma/seed.ts). Jangan pakai di staging/produksi nyata. */
export const SEED_OWNER = { email: 'owner@coffibeshop.id', password: 'ChangeMe123!' };

export const CREDS = {
  owner: {
    email: process.env.E2E_OWNER_EMAIL ?? SEED_OWNER.email,
    password: process.env.E2E_OWNER_PASSWORD ?? SEED_OWNER.password,
  },
};

/**
 * Login lewat API lalu tanam token ke localStorage — jauh lebih cepat & stabil
 * daripada mengisi form di setiap test. Satu test khusus (auth.spec) tetap
 * menguji form-nya sendiri.
 */
export async function loginAsStaff(page: Page, who: keyof typeof CREDS = 'owner') {
  const res = await page.request.post('/api/v1/auth/login', { data: CREDS[who] });
  expect(res.ok(), 'login API gagal — cek seed owner@coffibeshop.id').toBeTruthy();
  const { data } = await res.json();

  await page.addInitScript(
    ([token, user]) => {
      localStorage.setItem('cs.accessToken', token);
      localStorage.setItem('cs.user', user);
    },
    [data.access_token, JSON.stringify(data.user)] as const,
  );
  return data as { access_token: string; user: { id: string; role: string } };
}

/** Tunggu respons API tertentu — lebih andal daripada menunggu spinner hilang. */
export async function waitForApi(page: Page, urlPart: string, status = 200) {
  return page.waitForResponse(
    (r) => r.url().includes(urlPart) && r.status() === status,
  );
}

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    // Gagalkan test kalau ada error JS yang tidak tertangani (regresi senyap).
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(page);
    expect(errors, `Uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
  },
});

export { expect };

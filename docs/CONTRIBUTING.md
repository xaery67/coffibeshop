# 🤝 Panduan Kontribusi — `coffibeshop`

## Alur Kerja Git

```
main ─────────●────────────●──────────────▶  (produksi, selalu stabil)
               \          /
develop ────────●────●───●────────────────▶  (integrasi)
                 \  /
feature/xxx ──────●─●  (branch kerja)
```

### 1. Buat branch
```bash
git checkout -b feat/nama-fitur      # fitur
git checkout -b fix/nama-bug         # perbaikan
git checkout -b chore/nama-tugas     # non-fitur (deps, ci, docs)
```

### 2. Commit — Conventional Commits
```
feat(order): tambah endpoint reorder 1-klik
fix(cart): perbaiki merge guest→member duplikat
docs(prd): perbarui traceability QA v1.3
chore(deps): bump prisma ke 5.22
```

Tipe: `feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` · `chore` · `ci`

### 3. Push & buka Pull Request
```bash
git push -u origin feat/nama-fitur
```
- Isi template PR lengkap
- Tautkan issue: `Closes #12`
- Pastikan CI hijau
- Minta review (minimal 1 approval)

### 4. Merge
- **Squash & merge** ke `develop`/`main`
- Hapus branch setelah merge

## Standar Kode

| Aspek | Aturan |
|-------|--------|
| Bahasa kode | TypeScript strict |
| Format | Prettier (single quote, semi, width 100) |
| Lint | ESLint (flat config) |
| Test | Vitest (unit) + Playwright (E2E, fase berikutnya) |
| Commit | Conventional Commits |
| Envelope API | `{ success, data, error }` |
| Error API | Kode terstruktur (`BAD_REQUEST`, `NOT_FOUND`, …) |

## Perintah Berguna

```bash
npm run dev:api         # API dev (watch)
npm run dev:web         # Web dev
npm run build           # build semua workspace
npm run test            # test semua workspace
npm run lint            # lint
docker compose up -d    # stack penuh
```

## 🔒 Keamanan

- **JANGAN** commit `.env`, kunci API, atau kredensial
- Gunakan `.env.example` sebagai template
- Rahasia produksi via GitHub Secrets / Secrets Manager

import { describe, it, expect } from 'vitest';
import {
  ADMIN_ROLES,
  canAccessReports,
  canWriteMenu,
  hasRole,
  isOwner,
  isStaff,
  roleLabel,
  ROLE_LABELS,
} from './roles.js';

/**
 * RBAC klien (PRD-BACKEND §5). Kontrak kunci: `owner` selalu lolos (mirror
 * `requireRole` backend) — test ini menjaga paritas itu untuk staff vs owner.
 */

describe('hasRole — paritas dengan requireRole backend', () => {
  it('owner SELALU lolos untuk daftar apa pun', () => {
    expect(hasRole('owner', ['kasir'])).toBe(true);
    expect(hasRole('owner', [])).toBe(true);
    expect(hasRole('owner', ADMIN_ROLES)).toBe(true);
  });

  it('role di daftar → true; di luar daftar → false', () => {
    expect(hasRole('kasir', ADMIN_ROLES)).toBe(true);
    expect(hasRole('barista', ADMIN_ROLES)).toBe(true);
    expect(hasRole('member', ADMIN_ROLES)).toBe(false);
    expect(hasRole('guest', ADMIN_ROLES)).toBe(false);
  });

  it('role kosong/null → false', () => {
    expect(hasRole(null, ADMIN_ROLES)).toBe(false);
    expect(hasRole(undefined, ADMIN_ROLES)).toBe(false);
    expect(hasRole('', ADMIN_ROLES)).toBe(false);
  });
});

describe('isStaff / isOwner', () => {
  it('staff outlet dikenali; customer tidak', () => {
    for (const r of ['owner', 'manager', 'kasir', 'barista']) expect(isStaff(r)).toBe(true);
    for (const r of ['member', 'guest', 'finance']) expect(isStaff(r)).toBe(false);
  });

  it('isOwner hanya true untuk owner', () => {
    expect(isOwner('owner')).toBe(true);
    expect(isOwner('manager')).toBe(false);
    expect(isOwner(null)).toBe(false);
  });
});

describe('canAccessReports — owner/manager/finance', () => {
  it('staff boleh laporan; kasir & barista tidak', () => {
    expect(canAccessReports('owner')).toBe(true);
    expect(canAccessReports('manager')).toBe(true);
    expect(canAccessReports('finance')).toBe(true);
    expect(canAccessReports('kasir')).toBe(false);
    expect(canAccessReports('barista')).toBe(false);
  });
});

describe('canWriteMenu — owner/manager saja', () => {
  it('hanya owner & manager boleh menulis menu', () => {
    expect(canWriteMenu('owner')).toBe(true);
    expect(canWriteMenu('manager')).toBe(true);
    expect(canWriteMenu('kasir')).toBe(false);
    expect(canWriteMenu('barista')).toBe(false);
    expect(canWriteMenu('finance')).toBe(false);
  });
});

describe('roleLabel', () => {
  it('memberi label manusiawi & fallback ke nilai mentah', () => {
    expect(roleLabel('kasir')).toBe('Kasir');
    expect(roleLabel('owner')).toBe('Owner');
    expect(roleLabel(null)).toBe('Tamu');
    expect(roleLabel('custom-role')).toBe('custom-role');
    expect(Object.keys(ROLE_LABELS)).toContain('barista');
  });
});

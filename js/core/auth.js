// js/core/auth.js

import { supabase, getCurrentProfile } from './config.js';

export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }
  return profile;
}

export function requireRole(profile, allowedRoles) {
  if (!allowedRoles.includes(profile.role)) {
    alert('Bạn không có quyền truy cập mục này.');
    return false;
  }
  return true;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

// Tự đổi mật khẩu: xác minh mật khẩu hiện tại trước (đăng nhập lại bằng email của phiên hiện hành),
// rồi mới gọi updateUser. Chỉ tác động tài khoản đang đăng nhập — không đụng tài khoản người khác.
export const MIN_PASSWORD_LENGTH = 8;

export async function changeOwnPassword(currentPassword, newPassword) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
  }
  if (newPassword === currentPassword) {
    throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại.');
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');

  const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (verifyErr) throw new Error('Mật khẩu hiện tại không đúng.');

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export function roleLabel(role) {
  return { kho: 'Kho', sale: 'Sale', ke_toan: 'Kế toán', bgd: 'BGD', admin: 'Admin' }[role] || role;
}

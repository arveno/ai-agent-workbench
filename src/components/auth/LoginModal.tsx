import { useState, type FormEvent } from 'react';
import { useAuthSessionView, useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const authView = useAuthSessionView();
  const error = useAuthStore((state) => state.error);
  const signInWithPassword = useAuthStore((state) => state.signInWithPassword);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isSubmitting = authView.status === 'loading';
  const canSubmit = authView.isAuthConfigured && email.trim().length > 0 && password.length > 0 && !isSubmitting;

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const didSignIn = await signInWithPassword(email.trim(), password);

    if (didSignIn) {
      onClose();
    }
  };

  return (
    <div
      className="auth-modal-mask"
      role="dialog"
      aria-modal="true"
      aria-label="登录"
      onClick={onClose}
    >
      <div
        className="auth-modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="auth-modal-head">
          <div>
            <h3 className="auth-modal-title">登录</h3>
            <p className="auth-modal-subtitle">登录后可恢复 Supabase Auth 会话；公开演示模式无需登录。</p>
          </div>
          <Button type="button" variant="outline" size="icon-sm" onClick={onClose} aria-label="关闭">
            ×
          </Button>
        </div>

        <form className="auth-modal-body" onSubmit={handleSubmit}>
          {!authView.isAuthConfigured ? (
            <div className="auth-modal-notice">
              Supabase Auth 未配置，请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY 后再登录。
            </div>
          ) : null}

          <label className="auth-field">
            <span>邮箱</span>
            <Input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              placeholder="name@example.com"
              autoComplete="email"
              disabled={!authView.isAuthConfigured || isSubmitting}
            />
          </label>

          <label className="auth-field">
            <span>密码</span>
            <Input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              placeholder="输入密码"
              autoComplete="current-password"
              disabled={!authView.isAuthConfigured || isSubmitting}
            />
          </label>

          {error ? <p className="auth-modal-error">{error}</p> : null}

          <div className="auth-modal-actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              取消
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? '登录中...' : '登录'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

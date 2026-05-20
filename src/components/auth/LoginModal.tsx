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
  const signUpWithUsername = useAuthStore((state) => state.signUpWithUsername);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const isSubmitting = authView.status === 'loading';
  const canSubmit = authView.isAuthConfigured && username.trim().length > 0 && password.length > 0 && !isSubmitting;

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const didSignIn = await signInWithPassword(username.trim(), password);

    if (didSignIn) {
      onClose();
    }
  };

  const handleRegister = async () => {
    if (!canSubmit) {
      return;
    }

    const didSignUp = await signUpWithUsername(username.trim(), password);

    if (didSignUp) {
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
            <p className="auth-modal-subtitle">
              使用 CloudBase 用户名和密码登录；模拟模式无需登录，私有会话和真实 Agent 需要登录。
            </p>
          </div>
          <Button type="button" variant="outline" size="icon-sm" onClick={onClose} aria-label="关闭">
            ×
          </Button>
        </div>

        <form className="auth-modal-body" onSubmit={handleSubmit}>
          {!authView.isAuthConfigured ? (
            <div className="auth-modal-notice">
              CloudBase Auth 未配置，请设置 VITE_CLOUDBASE_ENV_ID 和 VITE_CLOUDBASE_REGION 后再登录。
            </div>
          ) : null}

          <label className="auth-field">
            <span>用户名</span>
            <Input
              type="text"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
              }}
              placeholder="5-24 位英文、数字、_ 或 -"
              autoComplete="username"
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
            <Button type="button" variant="outline" onClick={handleRegister} disabled={!canSubmit}>
              {isSubmitting ? '处理中...' : '注册'}
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

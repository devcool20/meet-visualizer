import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router';
import { AuthProvider, ProtectedRoute, useAuth } from './AuthContext';
import { __resetAuthClientForTests } from '@/lib/auth';

// This suite runs in mock-auth mode: no VITE_SUPABASE_URL is set in the test
// env, so `getAuthClient()` (used internally by AuthProvider) returns the
// localStorage-backed MockAuthClient. That is exactly what we want to
// exercise the loading -> signed-out -> signed-in transitions without a
// real network or a real Supabase project.

beforeAll(() => {
  // React 18's `act()` warns unless the environment marks itself explicitly.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function SignUpStub() {
  return createElement('div', null, 'signup-page');
}

function ProtectedStub() {
  return createElement('div', null, 'protected-content');
}

function SignInButton() {
  const { signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  return createElement(
    'button',
    {
      onClick: () => {
        void signInWithGoogle().then(() => navigate('/dashboard'));
      },
    },
    'sign in',
  );
}

function App() {
  return createElement(
    MemoryRouter,
    { initialEntries: ['/dashboard'] },
    createElement(
      AuthProvider,
      null,
      createElement(SignInButton),
      createElement(
        Routes,
        null,
        createElement(Route, { path: '/signup', element: createElement(SignUpStub) }),
        createElement(Route, {
          path: '/dashboard',
          element: createElement(ProtectedRoute, null, createElement(ProtectedStub)),
        }),
      ),
    ),
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(App));
  });
  return container;
}

function unmount() {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function clickButton(el: HTMLElement, text: string) {
  const buttons = Array.from(el.querySelectorAll('button'));
  const button = buttons.find((b) => b.textContent === text);
  if (!button) throw new Error(`button "${text}" not found`);
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetAuthClientForTests();
  });

  afterEach(() => {
    unmount();
    window.localStorage.clear();
    __resetAuthClientForTests();
  });

  it('redirects to /signup when signed out', async () => {
    const el = mount();
    await flush();
    expect(el.textContent).toContain('signup-page');
    expect(el.textContent).not.toContain('protected-content');
  });

  it('renders the protected content once signed in', async () => {
    const el = mount();
    await flush();
    expect(el.textContent).toContain('signup-page');

    clickButton(el, 'sign in');
    await flush();

    expect(el.textContent).toContain('protected-content');
  });

  it('persists the signed-in session across a fresh AuthProvider mount', async () => {
    const first = mount();
    await flush();
    clickButton(first, 'sign in');
    await flush();
    expect(first.textContent).toContain('protected-content');
    unmount();

    const second = mount();
    await flush();
    expect(second.textContent).toContain('protected-content');
  });
});

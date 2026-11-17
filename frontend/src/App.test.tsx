import { act, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import App from './App';

test('a user sees existing feature flags and their states', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([
    { key: 'new_checkout', description: 'Try the new checkout.', enabled: true },
    { key: 'dark_mode', description: '', enabled: false },
  ])));

  render(<App />);

  expect(await screen.findByText('new_checkout')).toBeVisible();
  expect(screen.getByText('Try the new checkout.')).toBeVisible();
  expect(screen.getByRole('switch', { name: 'new_checkout' })).toBeChecked();
  expect(screen.getByRole('switch', { name: 'dark_mode' })).not.toBeChecked();
});

test('a flag cannot be toggled again while its change is saving', async () => {
  let complete!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json([{ key: 'dark_mode', description: '', enabled: false }]))
    .mockReturnValueOnce(new Promise<Response>((resolve) => { complete = resolve; })));
  const user = userEvent.setup();
  render(<App />);
  const toggle = await screen.findByRole('switch', { name: 'dark_mode' });
  await user.click(toggle);
  expect(toggle).toBeDisabled();
  expect(toggle).not.toBeChecked();
  await act(async () => complete(Response.json({ key: 'dark_mode', description: '', enabled: true })));
  expect(toggle).toBeEnabled();
  expect(toggle).toBeChecked();
  expect(screen.getByRole('status')).toHaveTextContent('dark_mode enabled.');
});

test('creation is unavailable until the current flag list has loaded', async () => {
  let complete!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(new Promise<Response>((resolve) => { complete = resolve; })));
  render(<App />);
  expect(screen.getByRole('button', { name: 'Create flag' })).toBeDisabled();
  await act(async () => complete(Response.json([])));
  expect(screen.getByRole('button', { name: 'Create flag' })).toBeEnabled();
});

test('creation stays disabled until saving finishes and confirms the result', async () => {
  let complete!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json([]))
    .mockReturnValueOnce(new Promise<Response>((resolve) => { complete = resolve; })));
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('No flags yet');
  await user.type(screen.getByLabelText('Key'), 'dark_mode');
  await user.click(screen.getByRole('button', { name: 'Create flag' }));
  expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  expect(screen.getByLabelText('Key')).toBeDisabled();
  await act(async () => complete(Response.json({ key: 'dark_mode', description: '', enabled: false }, { status: 201 })));
  expect(screen.getByRole('status')).toHaveTextContent('Created dark_mode.');
  expect(screen.getByRole('button', { name: 'Create flag' })).toBeEnabled();
});

test('a failed toggle keeps the saved state and lets the user retry', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json([{ key: 'dark_mode', description: '', enabled: false }]))
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(Response.json({ key: 'dark_mode', description: '', enabled: true })));
  const user = userEvent.setup();
  render(<App />);
  const toggle = await screen.findByRole('switch', { name: 'dark_mode' });
  await user.click(toggle);
  expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch');
  expect(toggle).not.toBeChecked();
  await user.click(toggle);
  expect(toggle).toBeChecked();
});

test('a failed creation preserves input so the user can fix and retry it', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(Response.json({ message: 'This key already exists.' }, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ key: 'dark_mode', description: '', enabled: false }, { status: 201 })));
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('No flags yet');
  await user.type(screen.getByLabelText('Key'), 'dark_mode');
  await user.click(screen.getByRole('button', { name: 'Create flag' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This key already exists.');
  expect(screen.getByLabelText('Key')).toHaveValue('dark_mode');
  await user.click(screen.getByRole('button', { name: 'Create flag' }));
  expect(await screen.findByRole('switch', { name: 'dark_mode' })).not.toBeChecked();
});

test('a user can retry when flags fail to load', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ message: 'Cannot load flags.' }, { status: 500 }))
    .mockResolvedValueOnce(Response.json([])));
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot load flags.');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('No flags yet')).toBeVisible();
});

test('a user enables a flag and can disable it again', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json([{ key: 'dark_mode', description: '', enabled: false }]))
    .mockResolvedValueOnce(Response.json({ key: 'dark_mode', description: '', enabled: true }))
    .mockResolvedValueOnce(Response.json({ key: 'dark_mode', description: '', enabled: false })));
  const user = userEvent.setup();
  render(<App />);
  const toggle = await screen.findByRole('switch', { name: 'dark_mode' });
  await user.click(toggle);
  expect(toggle).toBeChecked();
  await user.click(toggle);
  expect(toggle).not.toBeChecked();
});

test('a user creates a disabled flag with a description', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json({
    key: 'new_checkout', description: 'Try the new checkout.', enabled: false,
  }, { status: 201 })));
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('No flags yet');
  await user.type(screen.getByLabelText('Key'), 'new_checkout');
  await user.type(screen.getByLabelText('Description'), 'Try the new checkout.');
  await user.click(screen.getByRole('button', { name: 'Create flag' }));
  expect(await screen.findByRole('switch', { name: 'new_checkout' })).not.toBeChecked();
  expect(screen.getByLabelText('Key')).toHaveValue('');
});

test('a user sees loading followed by guidance when no flags exist', async () => {
  let complete!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => { complete = resolve; })));
  render(<App />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading flags');
  complete(Response.json([]));
  expect(await screen.findByText('No flags yet')).toBeVisible();
});

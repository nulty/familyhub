// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openModal } from './modal.js';

describe('openModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="modal-root"></div>';
  });

  it('creates backdrop and modal in #modal-root', () => {
    openModal({ title: 'Test' });
    const root = document.getElementById('modal-root');
    expect(root.querySelector('.modal-backdrop')).toBeTruthy();
    expect(root.querySelector('.modal')).toBeTruthy();
  });

  it('sets the title text', () => {
    openModal({ title: 'My Title' });
    const h2 = document.querySelector('.modal-header h2');
    expect(h2.textContent).toBe('My Title');
  });

  it('renders string content as innerHTML', () => {
    openModal({ title: 'Test', content: '<p>Hello</p>' });
    const body = document.querySelector('.modal-body');
    expect(body.querySelector('p').textContent).toBe('Hello');
  });

  it('appends Node content to body', () => {
    const el = document.createElement('span');
    el.textContent = 'node content';
    openModal({ title: 'Test', content: el });
    const body = document.querySelector('.modal-body');
    expect(body.querySelector('span').textContent).toBe('node content');
  });

  it('close button removes backdrop from DOM', () => {
    openModal({ title: 'Test' });
    const closeBtn = document.querySelector('.modal-close');
    closeBtn.click();
    expect(document.querySelector('.modal-backdrop')).toBeNull();
  });

  it('clicking backdrop closes modal', () => {
    openModal({ title: 'Test' });
    const backdrop = document.querySelector('.modal-backdrop');
    backdrop.click();
    expect(document.querySelector('.modal-backdrop')).toBeNull();
  });

  it('fires onClose callback on close', () => {
    const onClose = vi.fn();
    openModal({ title: 'Test', onClose });
    document.querySelector('.modal-close').click();
    expect(onClose).toHaveBeenCalled();
  });

  it('returns { close, body } shape', () => {
    const result = openModal({ title: 'Test' });
    expect(typeof result.close).toBe('function');
    expect(result.body).toBeInstanceOf(HTMLElement);
  });

  it('programmatic close() removes modal', () => {
    const { close } = openModal({ title: 'Test' });
    close();
    expect(document.querySelector('.modal-backdrop')).toBeNull();
  });
});

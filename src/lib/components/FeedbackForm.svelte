<script>
  import Modal from '../forms/Modal.svelte';
  import { showToast } from '../shared/toast-store.js';
  import { collectDiagnostics, formatDiagnostics } from '../../util/diagnostics.js';
  import { submitFeedback, MAX_MESSAGE_LENGTH } from '../../util/feedback.js';

  let { onclose, initialKind = 'bug' } = $props();

  let kind = $state(initialKind);
  let message = $state('');
  let email = $state('');
  let website = $state(''); // honeypot — hidden from real users
  let submitting = $state(false);
  let errorMsg = $state('');
  let showDetails = $state(false);

  const diagnostics = collectDiagnostics();
  const remaining = $derived(MAX_MESSAGE_LENGTH - message.length);
  const canSubmit = $derived(message.trim().length > 0 && !submitting);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    submitting = true;
    errorMsg = '';

    try {
      const outcome = await submitFeedback({
        kind,
        message: message.trim(),
        email: email.trim() || null,
        website,
        diagnostics,
      });

      showToast(
        outcome === 'sent'
          ? 'Thanks — your feedback has been sent.'
          : "Saved. You're offline, so we'll send it when you reconnect."
      );
      onclose?.();
    } catch (err) {
      errorMsg = err.message;
    } finally {
      submitting = false;
    }
  }
</script>

<Modal title="Send feedback" {onclose}>
  <form class="feedback" onsubmit={handleSubmit}>
    <div class="form-group">
      <span class="label">What kind of feedback?</span>
      <div class="kind-toggle" role="radiogroup" aria-label="Feedback type">
        <button
          type="button" class="kind" class:selected={kind === 'bug'}
          role="radio" aria-checked={kind === 'bug'}
          onclick={() => kind = 'bug'}
        >
          <strong>Something's wrong</strong>
          <span>A bug, error, or something behaving oddly</span>
        </button>
        <button
          type="button" class="kind" class:selected={kind === 'question'}
          role="radio" aria-checked={kind === 'question'}
          onclick={() => kind = 'question'}
        >
          <strong>I have a question</strong>
          <span>Something's unclear or you're not sure how it works</span>
        </button>
      </div>
    </div>

    <div class="form-group">
      <label for="fb-message">
        {kind === 'bug' ? 'What happened?' : 'What would you like to know?'}
      </label>
      <textarea
        id="fb-message"
        bind:value={message}
        maxlength={MAX_MESSAGE_LENGTH}
        rows="6"
        placeholder={kind === 'bug'
          ? 'What were you doing, and what did you expect to happen instead?'
          : 'Ask away — no question is too small.'}
        required
      ></textarea>
      <div class="meta-row">
        <p class="form-hint privacy">
          Please don't include personal details about living relatives.
        </p>
        {#if remaining < 500}
          <span class="counter" class:low={remaining < 100}>{remaining} left</span>
        {/if}
      </div>
    </div>

    <div class="form-group">
      <label for="fb-email">Your email <span class="optional">(optional)</span></label>
      <input id="fb-email" type="email" bind:value={email} placeholder="you@example.com" />
      <p class="form-hint">Only used to reply. Leave it blank to stay anonymous.</p>
    </div>

    <!-- Honeypot: hidden from users, filled by bots. Not `display:none`, which
         some bots skip; kept out of the tab order and off-screen instead. -->
    <div class="honeypot" aria-hidden="true">
      <label for="fb-website">Website</label>
      <input id="fb-website" type="text" bind:value={website} tabindex="-1" autocomplete="off" />
    </div>

    <div class="disclosure">
      <button type="button" class="disclosure-toggle" onclick={() => showDetails = !showDetails}>
        {showDetails ? '▾' : '▸'} What gets sent with this
      </button>
      {#if showDetails}
        <div class="disclosure-body">
          <p class="form-hint">
            Your message, your email if you gave one, and the technical details below.
            <strong>Nothing from your family tree is included.</strong>
          </p>
          <pre>{formatDiagnostics(diagnostics)}</pre>
        </div>
      {/if}
    </div>

    {#if errorMsg}
      <p class="error">{errorMsg}</p>
    {/if}

    <div class="form-actions">
      <button type="button" class="btn" onclick={() => onclose?.()}>Cancel</button>
      <button type="submit" class="btn btn-primary" disabled={!canSubmit}>
        {submitting ? 'Sending…' : 'Send feedback'}
      </button>
    </div>
  </form>
</Modal>

<style>
  .label {
    display: block;
    margin-bottom: 6px;
    font-weight: var(--weight-medium);
  }

  .kind-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .kind {
    text-align: left;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    cursor: pointer;
  }

  .kind strong {
    display: block;
    font-size: var(--text-base);
    margin-bottom: 2px;
  }

  .kind span {
    font-size: var(--text-xs);
    color: var(--text-muted);
    line-height: 1.3;
  }

  .kind.selected {
    border-color: var(--accent);
    background: var(--surface-raised);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  textarea {
    width: 100%;
    resize: vertical;
    font-family: inherit;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .meta-row .form-hint {
    margin: 0;
  }

  .privacy {
    font-style: italic;
  }

  .counter {
    font-size: var(--text-xs);
    color: var(--text-muted);
    white-space: nowrap;
  }

  .counter.low {
    color: var(--danger);
  }

  .optional {
    font-weight: var(--weight-normal);
    color: var(--text-muted);
  }

  .honeypot {
    position: absolute;
    left: -9999px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }

  .disclosure {
    margin: 14px 0;
  }

  .disclosure-toggle {
    background: none;
    border: none;
    padding: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    cursor: pointer;
  }

  .disclosure-toggle:hover {
    color: var(--text-primary);
  }

  .disclosure-body pre {
    margin: 6px 0 0;
    padding: 8px 10px;
    background: var(--surface);
    border-radius: 4px;
    font-size: var(--text-xs);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--text-muted);
  }

  .error {
    color: var(--danger);
    font-size: var(--text-base);
    margin: 0 0 10px;
  }

</style>

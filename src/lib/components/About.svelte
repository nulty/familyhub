<script>
  import Modal from '../forms/Modal.svelte';
  import { pushModal } from '../shared/modal-stack.svelte.js';
  import FeedbackForm from './FeedbackForm.svelte';
  import { APP_VERSION, REPO_URL } from '../../version.js';

  let { onclose } = $props();

  function openFeedback() {
    onclose?.();
    pushModal(FeedbackForm, {});
  }

  // Hand-maintained: update when runtime dependencies change.
  const licenses = [
    { name: 'Svelte', license: 'MIT', url: 'https://svelte.dev' },
    { name: 'SQLite (sqlite-wasm)', license: 'Public domain / Apache-2.0', url: 'https://sqlite.org/wasm' },
    { name: 'family-chart', license: 'ISC', url: 'https://github.com/donatso/family-chart' },
    { name: 'Leaflet', license: 'BSD-2-Clause', url: 'https://leafletjs.com' },
    { name: 'Fuse.js', license: 'Apache-2.0', url: 'https://fusejs.io' },
    { name: 'Tom Select', license: 'Apache-2.0', url: 'https://tom-select.js.org' },
    { name: 'marked', license: 'MIT', url: 'https://marked.js.org' },
  ];
</script>

<Modal title="About Sinsear" {onclose}>
  <div class="about">
    <section class="about-intro">
      <p class="about-name">
        Sinsear <span class="about-phonetic">/ˈʃɪn.ʃɛɾ/</span>
      </p>
      <p class="about-meaning">Irish — <em>ancestor, grandparent</em></p>
      <p class="about-tagline">A family tree app that runs entirely in your browser.</p>
    </section>

    <dl class="about-meta">
      <dt>Version</dt>
      <dd>{APP_VERSION}</dd>
      <dt>Source</dt>
      <dd>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">{REPO_URL.replace('https://', '')}</a>
      </dd>
    </dl>

    <section>
      <h3>Where your data lives</h3>
      <p>
        By default everything stays on this device, stored in your browser using SQLite. No
        account is needed and nothing is uploaded.
      </p>
      <p>
        If you sign in and share a tree, that tree's data is synced to
        <code>api.sinsear.org</code> so collaborators can work on it with you. Your local copy
        stays in place as an offline cache.
      </p>
    </section>

    <section>
      <h3>Maps &amp; place data</h3>
      <p>
        Map tiles and place lookup (geocoding) are provided by
        <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
        and its
        <a href="https://nominatim.openstreetmap.org" target="_blank" rel="noopener noreferrer">Nominatim</a>
        service.
      </p>
      <p>
        Map data ©
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap contributors
        </a>, available under the
        <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener noreferrer">
          Open Database License (ODbL)
        </a>.
      </p>
    </section>

    <section>
      <h3>Found a problem?</h3>
      <p>
        Bug reports and questions are welcome — you don't need an account, and you can
        send them anonymously.
        <button type="button" class="link-btn" onclick={openFeedback}>Send feedback</button>
      </p>
    </section>

    <section>
      <h3>Open source</h3>
      <p>Sinsear is built with these open-source projects:</p>
      <ul class="about-licenses">
        {#each licenses as lib (lib.name)}
          <li>
            <a href={lib.url} target="_blank" rel="noopener noreferrer">{lib.name}</a>
            <span class="license-tag">{lib.license}</span>
          </li>
        {/each}
      </ul>
    </section>
  </div>
</Modal>

<style>
  .about section + section,
  .about .about-meta + section {
    margin-top: 20px;
  }

  .about h3 {
    font-size: var(--text-base);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  .about p {
    margin: 0 0 8px;
    line-height: 1.5;
  }

  .about-intro {
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .about-name {
    font-size: var(--text-2xl);
    font-weight: var(--weight-semibold);
    margin-bottom: 2px;
  }

  .about-phonetic {
    font-size: var(--text-base);
    font-weight: var(--weight-normal);
    color: var(--text-muted);
  }

  .about-meaning {
    font-size: var(--text-base);
    color: var(--text-muted);
  }

  .about-tagline {
    margin-top: 8px;
  }

  .about-meta {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 16px;
    margin: 16px 0 0;
    font-size: var(--text-base);
  }

  .about-meta dt {
    color: var(--text-muted);
  }

  .about-meta dd {
    margin: 0;
  }

  .about code {
    font-size: var(--text-sm);
    background: var(--surface);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .link-btn {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .about-licenses {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: var(--text-base);
  }

  .about-licenses li {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }

  .about-licenses li:last-child {
    border-bottom: none;
  }

  .license-tag {
    font-size: var(--text-xs);
    color: var(--text-muted);
    white-space: nowrap;
  }
</style>

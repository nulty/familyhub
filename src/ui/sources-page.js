/**
 * sources-page.js — Sources & repositories management modal
 */

import { repositories, sources, citations } from '../db/db.js';
import { emit, PERSON_SELECTED } from '../state.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { openRepositoryForm } from '../forms/repository-form.js';
import { openSourceForm } from '../forms/source-form.js';
import { openCitationForm } from '../forms/citation-form.js';
import { focusPerson } from './tree.js';

let closePageModal = null;

export async function openSourcesPage() {
  const content = document.createElement('div');
  content.className = 'sources-page';

  const { close, body } = openModal({ title: 'Sources & Repositories', content, wide: true });
  closePageModal = close;

  await renderPage(body);
}

async function renderPage(container) {
  const allRepos = await repositories.list();
  const allSources = await sources.list();

  const inner = container.querySelector('.sources-page') || container;
  inner.innerHTML = '';

  // Action buttons
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;margin-bottom:12px';

  const addRepoBtn = document.createElement('button');
  addRepoBtn.className = 'btn btn-primary btn-sm';
  addRepoBtn.textContent = '+ Repository';
  addRepoBtn.onclick = () => openRepositoryForm(null, () => renderPage(container));
  actions.appendChild(addRepoBtn);

  const addSourceBtn = document.createElement('button');
  addSourceBtn.className = 'btn btn-sm';
  addSourceBtn.textContent = '+ Source';
  addSourceBtn.onclick = () => openSourceForm(null, () => renderPage(container));
  actions.appendChild(addSourceBtn);

  inner.appendChild(actions);

  // Stats summary
  const orphanSources = allSources.filter(s => !s.repository_id);
  const linkedSources = allSources.filter(s => s.repository_id);

  const stats = document.createElement('div');
  stats.className = 'sources-stats';
  stats.textContent = `${allRepos.length} repositories, ${allSources.length} sources`;
  inner.appendChild(stats);

  // Repositories with their sources
  for (const repo of allRepos) {
    const repoSources = linkedSources.filter(s => s.repository_id === repo.id);
    const section = document.createElement('details');
    section.className = 'sources-repo-section';
    section.open = true;

    const summary = document.createElement('summary');
    summary.className = 'sources-repo-header';
    summary.innerHTML = `
      <span class="sources-repo-name">${esc(repo.name)}</span>
      ${repo.type ? `<span class="sources-repo-type">${esc(repo.type)}</span>` : ''}
      ${repo.url ? `<a href="${esc(repo.url)}" target="_blank" rel="noopener" class="sources-repo-url" onclick="event.stopPropagation()">${esc(repo.url)}</a>` : ''}
      <span class="sources-repo-count">(${repoSources.length})</span>
      <span class="sources-repo-actions">
        <button class="btn btn-sm sources-add-btn" data-add-source-repo="${repo.id}" data-repo-name="${esc(repo.name)}" title="Add source to this repository">+ Source</button>
        <button class="btn-link btn-sm" data-edit-repo="${repo.id}">edit</button>
        <button class="btn-link btn-sm" style="color:var(--danger)" data-delete-repo="${repo.id}">delete</button>
      </span>
    `;
    section.appendChild(summary);

    const sourceList = document.createElement('div');
    sourceList.className = 'sources-list';
    for (const src of repoSources) {
      sourceList.appendChild(renderSourceRow(src, container));
    }
    if (repoSources.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'section-empty';
      empty.textContent = 'No sources';
      sourceList.appendChild(empty);
    }
    section.appendChild(sourceList);
    inner.appendChild(section);
  }

  // Orphan sources (no repository)
  if (orphanSources.length > 0) {
    const section = document.createElement('details');
    section.className = 'sources-repo-section';
    section.open = true;

    const summary = document.createElement('summary');
    summary.className = 'sources-repo-header';
    summary.innerHTML = `
      <span class="sources-repo-name">No Repository</span>
      <span class="sources-repo-count">(${orphanSources.length})</span>
    `;
    section.appendChild(summary);

    const sourceList = document.createElement('div');
    sourceList.className = 'sources-list';
    for (const src of orphanSources) {
      sourceList.appendChild(renderSourceRow(src, container));
    }
    section.appendChild(sourceList);
    inner.appendChild(section);
  }

  if (allRepos.length === 0 && allSources.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'section-empty';
    empty.style.padding = '24px 0';
    empty.textContent = 'No repositories or sources yet. Import a GEDCOM file or add them manually.';
    inner.appendChild(empty);
  }

  // Event delegation for repo actions
  inner.onclick = async (e) => {
    const addSourceBtn = e.target.closest('[data-add-source-repo]');
    if (addSourceBtn) {
      e.stopPropagation();
      const repoId = addSourceBtn.dataset.addSourceRepo;
      const repoName = addSourceBtn.dataset.repoName;
      openSourceForm(null, () => renderPage(container), { repository_id: repoId, repository_name: repoName });
      return;
    }
    const editBtn = e.target.closest('[data-edit-repo]');
    if (editBtn) {
      e.stopPropagation();
      openRepositoryForm(editBtn.dataset.editRepo, () => renderPage(container));
      return;
    }
    const deleteBtn = e.target.closest('[data-delete-repo]');
    if (deleteBtn) {
      e.stopPropagation();
      if (!confirm('Delete this repository? Sources will be kept but unlinked.')) return;
      await repositories.delete(deleteBtn.dataset.deleteRepo);
      showToast('Repository deleted');
      renderPage(container);
    }
  };
}

function renderSourceRow(src, container) {
  const row = document.createElement('div');
  row.className = 'sources-source-row';
  row.innerHTML = `
    <span class="sources-source-title">${esc(src.title)}</span>
    ${src.type ? `<span class="sources-source-type">${esc(src.type)}</span>` : ''}
    ${src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener" class="sources-source-url">link</a>` : ''}
    <span class="sources-source-actions">
      <button class="btn-link btn-sm" data-action="show-citations" title="Show citations">citations</button>
      <button class="btn-link btn-sm" data-action="edit-source">edit</button>
      <button class="btn-link btn-sm" style="color:var(--danger)" data-action="delete-source">delete</button>
    </span>
  `;

  row.querySelector('[data-action="show-citations"]').onclick = async () => {
    // Toggle citations list
    const existing = row.nextElementSibling;
    if (existing?.classList.contains('source-citations-list')) {
      existing.remove();
      return;
    }
    const citationList = await citations.listForSource(src.id);
    const div = document.createElement('div');
    div.className = 'source-citations-list';

    if (citationList.length === 0) {
      div.innerHTML = '<div class="section-empty" style="padding:4px 0 4px 16px">No citations</div>';
    } else {
      for (const c of citationList) {
        const personName = [c.given_name, c.surname].filter(Boolean).join(' ') || 'Unnamed';
        const citRow = document.createElement('div');
        citRow.className = 'source-citation-row';
        citRow.innerHTML = `
          <span class="source-citation-event">${esc(c.event_type)}</span>
          ${c.event_date ? `<span class="source-citation-date">${esc(c.event_date)}</span>` : ''}
          <a href="#" class="source-citation-person" data-person-id="${c.person_id}">${esc(personName)}</a>
          ${c.detail ? `<span class="source-citation-detail">${esc(c.detail)}</span>` : ''}
          ${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener" class="source-citation-url">link</a>` : ''}
        `;
        citRow.querySelector('a[data-person-id]').onclick = (e2) => {
          e2.preventDefault();
          focusPerson(c.person_id);
          emit(PERSON_SELECTED, c.person_id);
          closePageModal?.();
        };
        div.appendChild(citRow);
      }
    }

    row.after(div);
  };

  row.querySelector('[data-action="edit-source"]').onclick = () => {
    openSourceForm(src.id, () => renderPage(container));
  };

  row.querySelector('[data-action="delete-source"]').onclick = async () => {
    if (!confirm(`Delete "${src.title}"? All citations to this source will be removed.`)) return;
    await sources.delete(src.id);
    showToast('Source deleted');
    renderPage(container);
  };

  return row;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

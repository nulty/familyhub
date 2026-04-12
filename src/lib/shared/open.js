/**
 * Imperative modal openers — push Svelte form/page components onto the modal stack.
 * Import these instead of the old bridge files in src/forms/ and src/ui/.
 */
import { pushModal } from './modal-stack.svelte.js';
import PersonForm from '../forms/PersonForm.svelte';
import EventForm from '../forms/EventForm.svelte';
import RelationshipForm from '../forms/RelationshipForm.svelte';
import PlaceForm from '../forms/PlaceForm.svelte';
import RepositoryForm from '../forms/RepositoryForm.svelte';
import SourceForm from '../forms/SourceForm.svelte';
import CitationForm from '../forms/CitationForm.svelte';
import SourcesPage from '../components/SourcesPage.svelte';
import PlacesPage from '../components/PlacesPage.svelte';
import GedcomImport from '../components/GedcomImport.svelte';
import ImportModal from '../components/ImportModal.svelte';

export function openPersonForm(personId, onCreated) {
  pushModal(PersonForm, { personId, oncreated: onCreated });
}

export function openEventForm(personId, eventId) {
  pushModal(EventForm, { personId, eventId });
}

export function openRelationshipForm(person, type) {
  pushModal(RelationshipForm, { person, type });
}

export function openPlaceForm(placeId, onComplete, prefill) {
  pushModal(PlaceForm, { placeId, oncomplete: onComplete, prefill });
}

export function openRepositoryForm(repoId, onComplete) {
  pushModal(RepositoryForm, { repoId, oncomplete: onComplete });
}

export function openSourceForm(sourceId, onComplete, prefill) {
  pushModal(SourceForm, { sourceId, oncomplete: onComplete, prefill });
}

export function openCitationForm(citationId, onComplete, prefill) {
  pushModal(CitationForm, { citationId, oncomplete: onComplete, prefill });
}

export function openSourcesPage() {
  pushModal(SourcesPage, {});
}

export function openPlacesPage() {
  pushModal(PlacesPage, {});
}

export function openGedcomImport(filename, data, stats, warnings) {
  pushModal(GedcomImport, { filename, data, stats, warnings });
}

export function openImportModal(onUploadStatus, onMigration) {
  pushModal(ImportModal, { onuploadstatus: onUploadStatus, onmigration: onMigration });
}
